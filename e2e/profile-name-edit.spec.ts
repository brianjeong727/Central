// The display name must be editable from Profile.
//
// It is the one profile field that is NOT self-service anywhere else: signup or
// the OAuth provider sets it once (lib/profile-name.ts), /complete-profile only
// asks when the gate trips, and after that a wrong name was permanent — which is
// exactly the state the private-relay and email-prefix accounts land in.
//
// The member fixture is SHARED across the whole suite, so this records the real
// name up front and restores it in afterAll.
import { test, expect } from "@playwright/test"
import { sandbox, memberState, E2E_PREFIX } from "./fixtures"

const NEW_NAME = `${E2E_PREFIX}Renamed Member`
let originalName: string | null = null
let memberId = ""

test.beforeAll(async () => {
  const sb = sandbox()
  memberId = await sb.memberUserId()
  const { data, error } = await sb.client.from("profiles").select("name").eq("id", memberId).single()
  if (error) throw error
  originalName = data.name
})

test.afterAll(async () => {
  const sb = sandbox()
  const { error } = await sb.client.from("profiles").update({ name: originalName }).eq("id", memberId)
  if (error) throw error
})

test.describe("profile display name", () => {
  test.use({ storageState: memberState })

  test("is editable and persists to profiles.name", async ({ page }) => {
    const sb = sandbox()
    await page.goto("/home?tab=profile")
    await expect(page.getByRole("button", { name: /edit profile/i }).first()).toBeVisible({ timeout: 20000 })
    await page.getByRole("button", { name: /edit profile/i }).first().click()

    const field = page.getByLabel("Your name").filter({ visible: true }).first()
    await expect(field).toBeVisible({ timeout: 10000 })
    await field.fill(NEW_NAME)
    await page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).first().click()

    // Read it back — the card re-rendering is not evidence the write landed.
    await expect.poll(async () => {
      const { data } = await sb.client.from("profiles").select("name").eq("id", memberId).single()
      return data?.name
    }, { timeout: 10000 }).toBe(NEW_NAME)

    // …and it survives a reload, i.e. it is not just local state.
    await page.reload()
    // Both identity cards render the name (desktop + the md:hidden Pocket one), so
    // filter to the visible one or this latches onto the hidden card at any width.
    await expect(page.getByText(NEW_NAME).filter({ visible: true }).first()).toBeVisible({ timeout: 20000 })
  })

  test("a blank name cannot be saved", async ({ page }) => {
    await page.goto("/home?tab=profile")
    await expect(page.getByRole("button", { name: /edit profile/i }).first()).toBeVisible({ timeout: 20000 })
    await page.getByRole("button", { name: /edit profile/i }).first().click()

    const field = page.getByLabel("Your name").filter({ visible: true }).first()
    await field.fill("")
    // Blank would render an empty monogram everywhere the person appears, so
    // Save is gated rather than silently reverting (which reads as "it didn't work").
    await expect(page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).first()).toBeDisabled()
  })
})
