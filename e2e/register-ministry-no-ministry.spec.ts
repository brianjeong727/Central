// A signed-in person with NO MINISTRY can reach the registration wizard.
//
// THE LOOP THIS FIXES. Every fresh signup is role='member' with no ministry.
// /ministries offers "Register your ministry" → /register-ministry, which gated
// on role alone and showed them "Only ministry admins can register. You're
// signed in as a member account." Its primary button is "Back to my ministry" →
// /home → proxy sees no ministry → /ministries. Back to the start. Reported as
// "stuck on choose a ministry, any button reroutes me to the same page", and it
// is the likeliest reason a pile of real accounts sit at ministry_id = null.
//
// The gate is right for the case it was WRITTEN for — a member of an existing
// ministry trying to register a second one — so that case is asserted too.
import { test, expect, type Page } from "@playwright/test"
import { loadEnv } from "./load-env"
import { sandbox } from "./fixtures"

loadEnv()

const PASSWORD = "e2e-Nomin!stry-2026"

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByPlaceholder("you@university.edu").fill(email)
  await page.getByPlaceholder("••••••••").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  // Deliberately NOT waiting for /home — the whole point is that this user has
  // no ministry and never gets there.
  await page.waitForTimeout(3500)
}

test.describe("register-ministry with no ministry", () => {
  let userId = ""
  const email = `e2e.nomin.${Date.now()}@test.com`

  test.beforeAll(async () => {
    const sb = sandbox()
    const { data, error } = await sb.client.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
      user_metadata: { name: "E2E No Ministry" },
    })
    if (error) throw error
    userId = data.user!.id
    // handle_new_user creates the profile; it lands with role 'member' and a null
    // ministry_id, which is exactly the state under test.
    await new Promise((r) => setTimeout(r, 1200))
    const { data: prof } = await sb.client.from("profiles").select("role, ministry_id").eq("id", userId).maybeSingle()
    expect(prof, "the signup trigger should have made a profile").toBeTruthy()
    expect((prof as { ministry_id: string | null }).ministry_id, "fixture must have no ministry").toBeNull()
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (!userId) return
    await sb.client.from("profiles").delete().eq("id", userId)
    await sb.client.auth.admin.deleteUser(userId).catch(() => {})
  })

  test("lands on the wizard instead of the admins-only card", async ({ page }) => {
    await signIn(page, email, PASSWORD)
    await page.goto("/register-ministry")
    await page.waitForTimeout(2500)

    await expect(page, "no ministry means this IS the registration path").toHaveURL(/\/onboarding/)
    await expect(page.getByText("Only ministry admins can register.")).toHaveCount(0)
  })

  test("the old loop is gone: the route never lands back on /ministries", async ({ page }) => {
    await signIn(page, email, PASSWORD)
    await page.goto("/register-ministry")
    await page.waitForTimeout(2500)
    expect(page.url(), "this is the exact circle that was reported").not.toContain("/ministries")
  })

  test("a member who ALREADY has a ministry still sees the gate", async ({ page }) => {
    // The card is correct for this person: they have a ministry, so its "Back to
    // my ministry" button resolves and registering a second one is not their call.
    const memberEmail = process.env.E2E_MEMBER_EMAIL
    const memberPassword = process.env.E2E_PASSWORD
    test.skip(!memberEmail || !memberPassword, "needs E2E member credentials")
    await signIn(page, memberEmail!, memberPassword!)
    await page.goto("/register-ministry")
    await page.waitForTimeout(2500)
    await expect(page.getByText("Only ministry admins can register.")).toBeVisible({ timeout: 10000 })
  })
})
