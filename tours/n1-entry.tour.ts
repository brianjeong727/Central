// N1 — Entry & onboarding (+ N10 founder/network). Public pages run signed-out;
// the ministries chooser, register gate, onboarding wizard and complete-profile
// run under the two real logins.
import { test } from "@playwright/test"
import { adminState, memberState, sandbox } from "../e2e/fixtures"
import { attempt, capture, coveredBy, goHome, isMobile, restoreRoles, setRole, settle, skip, STATE, type Role } from "./lib"

test.describe.configure({ mode: "serial" })

const PUBLIC: [string, string, string][] = [
  ["N1.1", "/", "Landing"],
  ["N1.2", "/login", "Login"],
  ["N1.3", "/signup", "Signup · role choice"],
  ["N1.4", "/forgot-password", "Forgot password"],
  ["N1.5", "/update-password", "Update password"],
  ["N1.13", "/delete-account", "Delete account"],
  ["N1.14", "/privacy", "Privacy"],
  ["N1.15", "/terms", "Terms"],
  ["N1.16", "/support", "Support"],
]

test.describe("N1 signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("public pages", async ({ page }) => {
    const role: Role = "visitor"
    const mobile = isMobile(page)
    for (const [id, path, label] of PUBLIC) {
      await attempt(page, id, role, async () => {
        await page.goto(path)
        await settle(page)
        await capture(page, id, { role, state: STATE, label })
      })
    }
    if (mobile) {
      await attempt(page, "N1.2", role, async () => {
        await page.goto("/login"); await settle(page)
        await page.getByText("Continue with email", { exact: true }).filter({ visible: true }).first().click({ timeout: 5_000 })
        await settle(page, 300)
        await capture(page, "N1.2", { role, state: `${STATE}-form`, label: "Login · form step (mobile)" })
      })
    }
    await attempt(page, "N1.3.1", role, async () => {
      await page.goto("/signup"); await settle(page)
      await page.getByText(/register a church/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N1.3.1", { role, state: STATE, label: "Signup · register a church" })
    })
    await attempt(page, "N1.3.2", role, async () => {
      await page.goto("/signup"); await settle(page)
      await page.getByText(/join a ministry/i).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N1.3.2", { role, state: STATE, label: "Signup · join a ministry" })
    })
    await attempt(page, "N1.8", role, async () => {
      const sb = sandbox()
      const { data: m } = await sb.client.from("ministries").select("invite_code").eq("id", sb.ministryId).single()
      await page.goto(`/j/${m!.invite_code}`); await settle(page)
      await capture(page, "N1.8", { role, state: `${STATE}-signed-out`, label: "Invite landing (signed out)" })
      await page.goto("/j/NOPE-1234"); await settle(page)
      await capture(page, "N1.8.1", { role, state: STATE, label: "Invite invalid" })
    })
    await attempt(page, "N1.9", role, async () => {
      await page.goto("/register-ministry"); await settle(page)
      await capture(page, "N1.9", { role, state: `${STATE}-signed-out`, label: "Register ministry (signed out → signup intent)" })
    })
    await attempt(page, "N1.7", role, async () => {
      await page.goto("/ministries"); await settle(page)
      await capture(page, "N1.7", { role, state: `${STATE}-signed-out`, label: "Ministries (signed out)" })
    })
    skip(page, "N1.3.3", role, "Verify-code step needs a real OTP email; reviewed from code.")
    skip(page, "N1.2.1", role, "No-account-for-provider error needs an OAuth round trip; reviewed from code.")
    skip(page, "N1.11", role, "Pending page needs a ministry in 'pending' status; neither sandbox is. Reviewed from code.")
  })
})

test.describe("N1 as member", () => {
  test.use({ storageState: memberState })
  test.afterAll(async () => {
    await restoreRoles()
    const sb = sandbox()
    await sb.client.from("profiles").update({ graduation_year: 2028 }).eq("id", await sb.memberUserId())
  })
  test("ministries, invite, register gate, complete-profile, pick-ministry", async ({ page }) => {
    await setRole("member", "member")
    const role: Role = "member"
    await attempt(page, "N1.7", role, async () => {
      await page.goto("/ministries"); await settle(page)
      await capture(page, "N1.7", { role, state: STATE, label: "Ministries · browse" })
      await page.goto("/ministries?tab=code"); await settle(page)
      await capture(page, "N1.7.1", { role, state: STATE, label: "Ministries · code" })
    })
    await attempt(page, "N1.8", role, async () => {
      const sb = sandbox()
      const { data: other } = await sb.client.from("ministries").select("invite_code").eq("name", "E2E Sandbox 2").single()
      await page.goto(`/j/${other!.invite_code}`); await settle(page)
      await capture(page, "N1.8", { role, state: `${STATE}-switching`, label: "Invite landing (member of another ministry)" })
    })
    await attempt(page, "N1.9", role, async () => {
      await page.goto("/register-ministry"); await settle(page)
      await capture(page, "N1.9", { role, state: STATE, label: "Register ministry gate (member)" })
    })
    await attempt(page, "N1.12", role, async () => {
      await page.goto("/pick-ministry"); await settle(page)
      await capture(page, "N1.12", { role, state: STATE, label: "Pick ministry" })
    })
    await attempt(page, "N1.6", role, async () => {
      const sb = sandbox()
      await sb.client.from("profiles").update({ graduation_year: null }).eq("id", await sb.memberUserId())
      await page.goto("/home"); await settle(page)
      await page.waitForURL(/complete-profile/, { timeout: 10_000 })
      await settle(page)
      await capture(page, "N1.6", { role, state: STATE, label: "Complete profile" })
      await sb.client.from("profiles").update({ graduation_year: 2028 }).eq("id", await sb.memberUserId())
    })
  })
})

test.describe("N1/N10 as admin", () => {
  test.use({ storageState: adminState })
  test.afterAll(async () => { await restoreRoles() })
  test("onboarding wizard, network tab, admin console", async ({ page }) => {
    await setRole("admin", "admin")
    const role: Role = "admin"
    await attempt(page, "N1.10", role, async () => {
      await page.goto("/onboarding"); await settle(page)
      await capture(page, "N1.10.1", { role, state: STATE, label: "Onboarding · 1 Basic info" })
      await page.getByPlaceholder("e.g. Central Student Fellowship").filter({ visible: true }).first().fill("Riverside Campus Fellowship")
      const uni = page.getByPlaceholder("e.g. University of Pittsburgh").filter({ visible: true }).first()
      await uni.fill("Riverside University")
      await uni.press("Enter")
      await page.getByPlaceholder("e.g. Pittsburgh, PA").filter({ visible: true }).first().fill("Riverside, CA")
      await page.getByText(/^small$|^medium$|^large$|students/i).filter({ visible: true }).first().click({ timeout: 3_000 }).catch(() => {})
      await settle(page, 300)
      await page.getByRole("button", { name: /next|continue/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N1.10.2", { role, state: STATE, label: "Onboarding · 2 Structure" })
      await page.getByRole("button", { name: /next|continue/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N1.10.3", { role, state: STATE, label: "Onboarding · 3 Workspaces" })
      await page.getByRole("button", { name: /next|continue|review/i }).filter({ visible: true }).first().click({ timeout: 5_000 })
      await settle(page, 300)
      await capture(page, "N1.10.4", { role, state: STATE, label: "Onboarding · 4 Review" })
      coveredBy(page, ["N1.10"], "N1.10.1", role)
    })
    await goHome(page, { tab: "network" })
    await capture(page, "N10.2", { role, state: STATE, label: "Network tab" })
    skip(page, "N10.1", role, "/admin is gated on the founder's email in proxy.ts; no test login can open it. Reviewed from code.")
    skip(page, "N1.7.2", role, "Duplicate-account dialog needs a second account with the same name; reviewed from code.")
    skip(page, "N1.7.3", role, "Post-join pickers fire once after a join; reviewed from code.")
    skip(page, "N1.7.4", role, "Staff role picker fires on a staff-code join; reviewed from code.")
    skip(page, "N1.7.5", role, "Same InviteShareModal as N2.11.")
  })
})
