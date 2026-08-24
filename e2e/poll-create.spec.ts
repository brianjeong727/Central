// Creating a poll, end to end.
//
// The poll composer had NO functional coverage — `poll-composer-keyboard.spec.ts`
// asserts the sheet clears the keyboard and nothing else, so the whole
// question-and-options form could have been broken and every poll test still
// passed. That gap is what made moving it onto the shared form primitives
// (CentralModal + FormField + Input + CentralButton) risky, and it is the reason
// this file exists rather than a snapshot of the new markup: what matters is that
// a leader can still ask their chat a question, not which classes the inputs carry.
import { test, expect } from "@playwright/test"
import { sandbox, E2E_PREFIX, adminState } from "./fixtures"

const PREFIX = `${E2E_PREFIX}pollcreate `
const QUESTION = `${PREFIX}Which night works for the retreat?`
const OPTIONS = ["Friday", "Saturday", "Sunday"]

test.describe("create a poll", () => {
  test.use({ storageState: adminState })

  let groupId = ""

  async function wipe() {
    const sb = sandbox()
    const { data: rooms } = await sb.client.from("groups").select("id")
      .eq("ministry_id", sb.ministryId).like("name", `${PREFIX}%`)
    for (const g of (rooms ?? []) as { id: string }[]) {
      // messages BEFORE polls — messages.poll_id is an FK, so the poll cannot go first.
      await sb.client.from("messages").delete().eq("group_id", g.id)
      await sb.client.from("polls").delete().eq("group_id", g.id)
      await sb.client.from("group_members").delete().eq("group_id", g.id)
      await sb.client.from("groups").delete().eq("id", g.id)
    }
  }

  test.beforeAll(async () => {
    await wipe()
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const { data: g } = await sb.client.from("groups").insert({
      name: `${PREFIX}room`, type: "my", ministry_id: sb.ministryId, created_by: adminId,
    }).select("id").single()
    groupId = (g as { id: string }).id
    await sb.client.from("group_members").insert({ group_id: groupId, user_id: adminId })
  })

  test.afterAll(wipe)

  test("fills the form, adds a third option, and posts the poll to the chat", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    // The dev overlay sits over the composer and swallows the click.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" })
    await page.getByTitle("Create a poll").first().click()

    await expect(page.getByText("Create a poll").first()).toBeVisible({ timeout: 10_000 })
    // Two rows to start, and the cap is stated rather than discovered by the Add
    // button silently vanishing.
    await expect(page.getByText("2 of 5").first()).toBeVisible()

    await page.getByPlaceholder("Ask something…").fill(QUESTION)
    await page.getByPlaceholder("Option 1").fill(OPTIONS[0])
    await page.getByPlaceholder("Option 2").fill(OPTIONS[1])

    // A third option is the case the old markup's remove-X only appeared for.
    await page.getByRole("button", { name: "Add option" }).click()
    await page.getByPlaceholder("Option 3").fill(OPTIONS[2])
    await expect(page.getByText("3 of 5").first()).toBeVisible()

    // Remove and re-add it, so the row control is exercised and not merely rendered.
    await page.getByRole("button", { name: "Remove option 3" }).click()
    await expect(page.getByText("2 of 5").first()).toBeVisible()
    await page.getByRole("button", { name: "Add option" }).click()
    await page.getByPlaceholder("Option 3").fill(OPTIONS[2])

    await page.getByRole("button", { name: "Create poll" }).click()

    // The poll reaches the transcript...
    await expect(page.getByText(QUESTION).first()).toBeVisible({ timeout: 15_000 })

    // ...and the DB, with its options in order. The optimistic row renders before
    // either insert resolves, so the visible question alone proves nothing.
    const sb = sandbox()
    await expect
      .poll(async () => {
        const { data } = await sb.client.from("polls").select("question, options").eq("group_id", groupId)
        return (data ?? []).length
      }, { timeout: 20_000, message: "the poll must be persisted, not just optimistic" })
      .toBe(1)

    const { data: polls } = await sb.client.from("polls").select("id, question, options").eq("group_id", groupId)
    const poll = (polls ?? [])[0] as { id: string; question: string; options: string[] }
    expect(poll.question).toBe(QUESTION)
    expect(poll.options).toEqual(OPTIONS)

    const { data: msgs } = await sb.client.from("messages")
      .select("message_type, poll_id").eq("group_id", groupId).eq("message_type", "poll")
    expect((msgs ?? []).length, "the poll needs a message to hang off").toBe(1)
    expect((msgs ?? [])[0].poll_id).toBe(poll.id)
  })

  test("the submit stays disabled until there is a question and two options", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${groupId}`)
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" })
    await page.getByTitle("Create a poll").first().click()

    const create = page.getByRole("button", { name: "Create poll" })
    await expect(create).toBeDisabled()

    await page.getByPlaceholder("Ask something…").fill("Anything?")
    await expect(create, "a question with no options is not a poll").toBeDisabled()

    await page.getByPlaceholder("Option 1").fill("Yes")
    await expect(create, "one option is not a choice").toBeDisabled()

    await page.getByPlaceholder("Option 2").fill("No")
    await expect(create).toBeEnabled()
  })
})
