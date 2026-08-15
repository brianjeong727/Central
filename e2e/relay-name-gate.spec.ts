// An OAuth signup can land with the email's local part as its display name —
// handle_new_user falls back to split_part(email,'@',1) whenever the mint carries
// no name metadata. Apple is the usual cause (it returns a name only on the FIRST
// authorization, never in the token), and with a private-relay address the result
// is opaque ("ygcvnyy625"); with a shared real address it is merely wrong
// ("captkidjr"). Either way it is shown to the whole ministry, and
// /complete-profile collected gender and graduation_year but never name.
//
// The completeness gate treats such a name as incomplete. It used to be scoped to
// @privaterelay.appleid.com because the naive rule (name === email local part)
// would also re-gate ~200 load-test profiles and any user whose real name matched
// their prefix. The rule now additionally requires the name to be a LONE token
// (lib/profile-name.ts) — every real full name has a space — so it applies to any
// address without touching a user who has a genuine name.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const PW = "E2E-Relay-Passw0rd!"
const STAMP = Date.now().toString().slice(-6)
const RELAY_LOCAL = `zz9relay${STAMP}`
const RELAY_EMAIL = `${RELAY_LOCAL}@privaterelay.appleid.com`
const PREFIX_LOCAL = `zz9prefix${STAMP}`
const PREFIX_EMAIL = `${PREFIX_LOCAL}@example.com`
const NORMAL_EMAIL = `e2e-relay-control-${Date.now()}@example.com`

let relayId = ""
let prefixId = ""
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
  prefixId = await mkUser(PREFIX_EMAIL, PREFIX_LOCAL)                    // ordinary address, prefix name
  controlId = await mkUser(NORMAL_EMAIL, `${E2E_PREFIX}Real Name`)       // ordinary account
})

test.afterAll(async () => {
  const sb = sandbox()
  for (const id of [relayId, prefixId, controlId]) {
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

  // The half the relay-only rule missed: a NON-relay OAuth account whose name is
  // its own email prefix. This is the shape that actually shipped to a real user.
  test("a non-relay account whose name is the email prefix is also sent to complete-profile", async ({ page }) => {
    await login(page, PREFIX_EMAIL)
    await page.waitForURL(/\/complete-profile/, { timeout: 30_000 })
    await expect(page.getByText(/^your name$/i).filter({ visible: true }).first())
      .toBeVisible({ timeout: 15000 })
  })

  test("an ordinary complete account is NOT gated", async ({ page }) => {
    await login(page, NORMAL_EMAIL)
    await page.waitForURL(/\/home|\/ministries|\/pick-ministry/, { timeout: 30_000 })
    expect(page.url()).not.toContain("/complete-profile")
  })
})
