// Two graduation questions exist and must not arrive together.
//
//   "Have you graduated?"             — Home banner, needs_grad_check, sets COHORT
//   "Stay in the ministry, or leave?" — blocking modal, driven by class year
//
// Both key off the same people at the same moment (from 1 Aug, once the cohort
// flag is driven by graduation year). One is a blocking modal stacked on a banner
// asking almost the same words. The cohort question goes first — its answer is
// what makes the other meaningful.
import { test, expect } from "@playwright/test"
import { sandbox, memberState } from "./fixtures"

test.describe("graduation prompts do not stack", () => {
  test.describe.configure({ timeout: 180000 })
  test.use({ storageState: memberState })

  let memberId = ""
  let saved: { graduation_year: number | null; needs_grad_check: boolean | null; grad_prompt_dismissed: boolean | null; grade: string | null } | null = null

  test.beforeAll(async () => {
    const sb = sandbox()
    memberId = await sb.memberUserId()
    const { data } = await sb.client.from("profiles")
      .select("graduation_year, needs_grad_check, grad_prompt_dismissed, grade").eq("id", memberId).single()
    saved = data as typeof saved
  })

  test.afterAll(async () => {
    if (saved) await sandbox().client.from("profiles").update(saved).eq("id", memberId)
  })

  const leaveModal = (p: import("@playwright/test").Page) =>
    p.getByText("Congratulations, graduate.", { exact: false }).filter({ visible: true })
  const cohortBanner = (p: import("@playwright/test").Page) =>
    p.getByText("Have you graduated?", { exact: false }).filter({ visible: true })

  test("while the cohort question is pending, the leave modal stays away", async ({ page }) => {
    // A graduate who has not yet answered the cohort question.
    await sandbox().client.from("profiles").update({
      graduation_year: new Date().getFullYear() - 1,
      needs_grad_check: true, grad_prompt_dismissed: false, grade: null,
    }).eq("id", memberId)

    await page.goto("/home?tab=home")
    await expect(cohortBanner(page)).toBeVisible({ timeout: 20000 })
    await expect(leaveModal(page), "the blocking modal must not stack on the banner")
      .toHaveCount(0)
  })

  test("once the cohort question is answered, the leave modal appears", async ({ page }) => {
    // Same graduate, having answered — the flag is what respondToGradCheck clears.
    await sandbox().client.from("profiles").update({
      graduation_year: new Date().getFullYear() - 1,
      needs_grad_check: false, grad_prompt_dismissed: false, grade: null,
    }).eq("id", memberId)

    await page.goto("/home?tab=home")
    await expect(leaveModal(page), "it must not be lost — only deferred")
      .toBeVisible({ timeout: 20000 })
    await expect(cohortBanner(page)).toHaveCount(0)
  })
})
