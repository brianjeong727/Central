// Chat text size — the default, the preference, and the preview.
//
// What this proves:
//  (a) A bubble renders at 16px at phone width by default (the contract range in
//      mobile_design_system.md §2 is 15.5–17; the build shipped 14, which is the
//      drift this feature corrected), and the composer types at the same size —
//      one token, so the two cannot disagree.
//  (b) Profile → Settings → Text size stages a step behind Save (Convention #21):
//      the preview inside the card follows the pending step, the transcript does
//      NOT, and Cancel puts it back.
//  (c) A SAVED step is applied app-wide (html[data-chat-text]) and survives a
//      reload — it is a profile column, not browser storage (Convention #1).
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX, memberState } from "./fixtures"

const CHAT = `${E2E_PREFIX}Text Size Chat`
const SHOT_DIR = process.env.CHAT_SHOT_DIR

let chatId = ""
let memberId = ""

async function shot(page: Page, name: string) {
  if (!SHOT_DIR) return
  await page.screenshot({ path: `${SHOT_DIR}/text-size-${name}.png`, fullPage: false })
}

const bubble = (page: Page) => page.locator("[data-message-bubble]").first()
const fontSize = (loc: ReturnType<Page["locator"]>) => loc.evaluate((el) => getComputedStyle(el).fontSize)

test.describe("chat text size", () => {
  test.use({ storageState: memberState })

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()
    const { data, error } = await sb.client
      .from("groups")
      .insert({ ministry_id: sb.ministryId, name: CHAT, type: "my", created_by: adminId })
      .select("id").single()
    if (error) throw error
    chatId = data.id
    const { error: gm } = await sb.client
      .from("group_members")
      .insert([{ group_id: chatId, user_id: adminId }, { group_id: chatId, user_id: memberId }])
    if (gm) throw gm
    const { error: m } = await sb.client.from("messages").insert([
      { group_id: chatId, sender_id: adminId, content: "Hey! Are you coming to DG tonight? We're starting at 7 and Grace is bringing food." },
      { group_id: chatId, sender_id: memberId, content: "Yes — see you at 7" },
    ])
    if (m) throw m
    // Start every run from the default step, whatever the last run left behind.
    await sb.client.from("profiles").update({ chat_text_size: "md" }).eq("id", memberId)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.client.from("profiles").update({ chat_text_size: "md" }).eq("id", memberId)
    if (chatId) {
      await sb.client.from("messages").delete().eq("group_id", chatId)
      await sb.client.from("groups").delete().eq("id", chatId)
    }
  })

  test("a message reads at 16px by default, and so does the composer", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${chatId}`)
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 })
    expect(await fontSize(bubble(page))).toBe("16px")
    const composer = page.locator("textarea").filter({ visible: true }).first()
    await expect(composer).toBeVisible()
    expect(await fontSize(composer)).toBe("16px")
    // The bubble's padding is in em, so at the default it lands on the shipped 10/16.
    const pad = await bubble(page).evaluate((el) => {
      const s = getComputedStyle(el)
      return `${s.paddingTop} ${s.paddingLeft}`
    })
    expect(pad).toBe("10px 16px")
    await shot(page, "chat-default")
  })

  test("the preview follows the pending step; Cancel reverts; Save applies everywhere", async ({ page }) => {
    await page.goto(`/home?tab=profile&pset=textsize`)
    const preview = page.getByTestId("chat-text-preview").filter({ visible: true })
    await expect(preview).toBeVisible({ timeout: 20_000 })
    const previewBubble = preview.locator(".chat-bubble-pad").first()
    expect(await fontSize(previewBubble)).toBe("16px")
    await shot(page, "settings-default")

    // Pick Extra large: the preview grows, the page itself does not.
    await page.getByRole("radiogroup", { name: "Text size" }).filter({ visible: true }).getByText("Extra large", { exact: true }).click()
    expect(await fontSize(previewBubble)).toBe("20px")
    expect(await page.evaluate(() => document.documentElement.dataset.chatText ?? "")).toBe("")
    await shot(page, "settings-xl-pending")

    // Cancel puts the preview back and hides the buttons.
    await page.getByRole("button", { name: "Cancel" }).filter({ visible: true }).click()
    expect(await fontSize(previewBubble)).toBe("16px")
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0)

    // Pick Large and save: the html attribute flips, the row's meta reads it back,
    // and the DB row holds it.
    await page.getByRole("radiogroup", { name: "Text size" }).filter({ visible: true }).getByText("Large", { exact: true }).click()
    await page.getByRole("button", { name: "Save changes" }).filter({ visible: true }).click()
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.chatText)).toBe("lg")
    const sb = sandbox()
    const { data } = await sb.client.from("profiles").select("chat_text_size").eq("id", memberId).single()
    expect(data?.chat_text_size).toBe("lg")

    // It is a profile column, so a fresh load of the chat carries it.
    await page.goto(`/home?tab=chats&chat=${chatId}`)
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 })
    expect(await fontSize(bubble(page))).toBe("18px")
    await shot(page, "chat-large")
  })
})
