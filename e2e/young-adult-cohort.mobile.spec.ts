// Guards the young-adult cohort (lib/cohort.ts + setYoungAdult + moveToCohortChat).
//
// The thing under test is NOT the label. It is that the cohort and the CHAT stay
// in lockstep. They did not before: the graduation flow set grade='young_adult'
// and then looked for chats named "Senior Chat" / "Young Adult Chat", neither of
// which anything has ever created (class chats are "Class of {year}") — so every
// graduating senior kept their profile label and their old class chat, silently,
// for as long as the feature has existed. A test that only asserts the label
// would have passed throughout. So this asserts membership moved.
import { test, expect } from "@playwright/test"
import { sandbox, memberState } from "./fixtures"

test.describe("young adult cohort (mobile)", () => {
  test.describe.configure({ timeout: 180000 })
  test.use({ storageState: memberState })

  const CLASS_YEAR = 2029
  let memberId = ""
  let originalGrade: string | null = null
  let originalYear: number | null = null

  test.beforeAll(async () => {
    const sb = sandbox()
    memberId = await sb.memberUserId()
    const { data } = await sb.client.from("profiles").select("grade, graduation_year").eq("id", memberId).single()
    originalGrade = data?.grade ?? null
    originalYear = data?.graduation_year ?? null
    // A class year to be moved OUT of, and a clean starting cohort.
    await sb.client.from("profiles").update({ graduation_year: CLASS_YEAR, grade: null }).eq("id", memberId)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.client.from("profiles")
      .update({ grade: originalGrade, graduation_year: originalYear }).eq("id", memberId)
  })

  async function chatNames(): Promise<string[]> {
    const { data } = await sandbox().client
      .from("group_members").select("groups!group_id(name)").eq("user_id", memberId)
    return (data ?? [])
      .map((r) => (r as { groups?: { name?: string } }).groups?.name)
      .filter((n): n is string => !!n)
  }

  test("ticking young adult moves them out of their class chat and into Young Adults", async ({ page }) => {
    await page.goto("/home?tab=profile")
    await page.waitForTimeout(2500)

    await page.getByRole("button", { name: /edit profile/i }).filter({ visible: true }).first().click()
    await page.waitForTimeout(1000)

    const tick = page.getByRole("button", { name: /young adult/i }).filter({ visible: true }).first()
    await expect(tick).toBeVisible({ timeout: 15000 })
    await tick.click()
    await expect(tick).toHaveAttribute("aria-pressed", "true")

    await page.getByRole("button", { name: /^save$/i }).filter({ visible: true }).first().click()

    // The profile label and the chat membership must BOTH move — that pairing is
    // the whole contract, and asserting only the first is what let the original
    // bug live.
    await expect.poll(async () => {
      const { data } = await sandbox().client.from("profiles").select("grade").eq("id", memberId).single()
      return data?.grade ?? null
    }, { message: "grade must become young_adult", timeout: 20000 }).toBe("young_adult")

    await expect.poll(chatNames, {
      message: "must be added to the Young Adults chat",
      timeout: 20000,
    }).toContain("Young Adults")

    expect(await chatNames(), "must be removed from their own class chat")
      .not.toContain(`Class of ${CLASS_YEAR}`)
  })
})
