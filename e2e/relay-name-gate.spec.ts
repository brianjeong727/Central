// An Apple PRIVATE RELAY signup lands with the email's local part as its display
// name ("ygcvnyy625") — handle_new_user falls back to split_part(email,'@',1) and
// Apple only returns a real name on the FIRST authorization. That opaque string is
// shown to the whole ministry, and /complete-profile collected gender and
// graduation_year but never name, so the user could not correct it.
//
// The completeness gate now treats such a name as incomplete. Scoped to relay
// addresses ON PURPOSE: the general rule (name === email local part) also matches
// ~200 load-test profiles in this database, i.e. it would re-gate users who have
// no problem.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const PW = "E2E-Relay-Passw0rd!"
const RELAY_LOCAL = `zz9relay${Date.now().toString().slice(-6)}`
const RELAY_EMAIL = `${RELAY_LOCAL}@privaterelay.appleid.com`
const NORMAL_EMAIL = `e2e-relay-control-${Date.now()}@example.com`

let relayId = ""
let controlId = ""

async function mkUser(email: string, name: string, withProfile: Partial<Record<string, unknown>> = {}) {
  const sb = sandbox()
  const { data, error } = await sb.client.auth.admin.createUser({ email, password: PW, email_confirm: true })
  if (error || !data?.user) throw new Error(`createUser: ${error?.message}`)
  await sb.client.from("profiles").update({
    ministry_id: sb.ministryId, role: "member", name,
    gender: "male", graduation_year: new Date().getFullYear() + 2, ...withProfile,
  }).eq("id", data.user.id)
  return data.user.id
}

test.beforeAll(async () => {
  // Both are otherwise COMPLETE (gender + grad year set) — so anything that gates
  // them can only be the name rule.
  relayId = await mkUser(RELAY_EMAIL, RELAY_LOCAL)                       // name === relay local part
  controlId = await mkUser(NORMAL_EMAIL, `${E2E_PREFIX}Real Name`)       // ordinary account
})

test.afterAll(async () => {
  const sb = sandbox()
  for (const id of [relayId, controlId]) {
    if (!id) continue
    await sb.client.from("profiles").delete().eq("id", id)
    await sb.client.auth.admin.deleteUser(id).catch(() => {})
  }
})

async function login(page: Page, email: string) {
  await page.goto("/login")
  const entry = page.getByRole("button", { name: "Continue with email" })
  if (await entry.isVisible().catch(() => false)) await entry.click()
  const f = page.getByPlaceholder("you@university.edu").filter({ visible: true }).first()
  await f.waitFor({ state: "visible", timeout: 15000 })
  await f.fill(email)
  await page.getByPlaceholder("••••••••").filter({ visible: true }).first().fill(PW)
  await page.getByRole("button", { name: "Sign in" }).filter({ visible: true }).first().click()
}

test.describe("private-relay display name", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("a relay account whose name is the email prefix is sent to complete-profile", async ({ page }) => {
    await login(page, RELAY_EMAIL)
    await page.waitForURL(/\/complete-profile/, { timeout: 30_000 })
    // …and it asks for a NAME, which it never used to. Case-insensitive: the
    // desktop field label is literally "YOUR NAME", the Pocket one "Your name".
    await expect(page.getByText(/^your name$/i).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 })
  })

  test("an ordinary complete account is NOT gated", async ({ page }) => {
    await login(page, NORMAL_EMAIL)
    await page.waitForURL(/\/home|\/ministries|\/pick-ministry/, { timeout: 30_000 })
    expect(page.url()).not.toContain("/complete-profile")
  })
})
