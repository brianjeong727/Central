// N2 — Home & shell. See .claude/task-context/design-pass/inventory.md.
//
// Captures the shell + Home at both widths for every role whose view differs
// (pastor / admin / leader on the admin login; member / visitor on the member
// login), plus the overlays that live at shell level: slide manager, command
// palette, invite modal, grad prompt, message banner, entry splash.
//
//   DESIGN_PASS_STATE=populated npx playwright test -c playwright.design-pass.config.ts tours/n2-home-shell.tour.ts
//   E2E_LANE=2 DESIGN_PASS_STATE=empty  npx playwright test -c playwright.design-pass.config.ts tours/n2-home-shell.tour.ts
import { test } from "@playwright/test"
import { adminState, memberState, sandbox } from "../e2e/fixtures"
import { capture, coveredBy, goHome, isMobile, restoreRoles, setRole, settle, skip, attempt, STATE, type Role } from "./lib"

test.describe.configure({ mode: "serial" })

async function homeForRole(page: import("@playwright/test").Page, role: Role) {
  await goHome(page)
  const mobile = isMobile(page)
  await capture(page, mobile ? "N2.4" : "N2.3", { role, state: STATE, label: `Home (${mobile ? "pocket" : "desktop"})` })
  if (mobile) {
    coveredBy(page, ["N2.2", "N2.4.1", "N2.4.2", "N2.4.3", "N2.4.4", "N2.4.5", "N2.4.6", "N2.4.7", "N2.4.8", "N2.4.9"], "N2.4", role)
  } else {
    coveredBy(page, ["N2.1", "N2.1.3", "N2.3.1", "N2.3.2", "N2.3.3", "N2.3.4", "N2.3.5", "N2.3.6"], "N2.3", role)
  }
}

test.describe("N2 admin-login roles", () => {
  test.use({ storageState: adminState })

  test.afterAll(async () => { await restoreRoles() })

  for (const role of ["admin", "pastor", "leader"] as Role[]) {
    test(`home as ${role}`, async ({ page }) => {
      await setRole("admin", role)
      await homeForRole(page, role)

      if (role === "admin") {
        // Shell extras that don't depend on role.
        if (!isMobile(page)) {
          await attempt(page, "N2.1.1", role, async () => {
            const toggle = page.locator("button[title*='ollapse'], button[aria-label*='ollapse'], button[title*='Compact'], button[aria-label*='Compact']").first()
            await toggle.click({ timeout: 5_000 })
            await settle(page)
            await capture(page, "N2.1.1", { role, state: STATE, label: "Rail compact" })
            await toggle.click({ timeout: 5_000 }).catch(() => {})
            await page.locator("button[title*='xpand'], button[aria-label*='xpand']").first().click({ timeout: 3_000 }).catch(() => {})
            await settle(page)
          })
          await attempt(page, "N2.6", role, async () => {
            await page.keyboard.press("Meta+k")
            await page.waitForTimeout(400)
            await capture(page, "N2.6", { role, state: STATE, label: "Command palette", foldOnly: true })
            await page.keyboard.type("sar")
            await page.waitForTimeout(500)
            await capture(page, "N2.6", { role, state: `${STATE}-query`, label: "Command palette · query", foldOnly: true })
            await page.keyboard.press("Escape")
          })
        }
        // Curate → slide manager (leader-tier, so admin sees it).
        await attempt(page, "N2.5", role, async () => {
          await goHome(page)
          await page.getByRole("button", { name: /curate/i }).filter({ visible: true }).first().click({ timeout: 8_000 })
          await settle(page)
          await capture(page, "N2.5", { role, state: STATE, label: "Home slide manager", foldOnly: true })
          await page.keyboard.press("Escape")
        })
        // Invite share modal from the mobile quick tile.
        if (isMobile(page)) {
          await attempt(page, "N2.11", role, async () => {
            await goHome(page)
            await page.getByText(/invite someone/i).filter({ visible: true }).first().click({ timeout: 8_000 })
            await settle(page)
            await capture(page, "N2.11", { role, state: STATE, label: "Invite share modal", foldOnly: true })
            await page.keyboard.press("Escape")
          })
          await attempt(page, "N2.8", role, async () => {
            await page.goto("/home")
            await page.waitForTimeout(80)
            await page.screenshot({ path: `${process.env.DESIGN_PASS_OUT || ".claude/task-context/design-pass"}/shots/N2.8__mobile__${role}__${STATE}__fold.png` })
            await capture(page, "N2.8", { role, state: STATE, label: "Entry splash (best-effort frame)", foldOnly: true })
          })
        }
        // Message banner: seed a message into a chat the admin belongs to while Home is open.
        await attempt(page, "N2.12", role, async () => {
          await goHome(page)
          const sb = sandbox()
          const adminId = await sb.adminUserId()
          const memberId = await sb.memberUserId()
          // A SMALL chat: at ≥30 members the default is mentions-only and no banner fires.
          const { data: g } = await sb.client.from("groups").select("id").eq("ministry_id", sb.ministryId).eq("name", "Tuesday Night DG").maybeSingle()
          if (!g) throw new Error("no small chat for banner")
          await sb.client.from("messages").insert({ group_id: g.id, sender_id: memberId, content: "Is anyone bringing the projector tonight?" })
          await page.waitForTimeout(1800)
          await capture(page, "N2.12", { role, state: STATE, label: "In-app message banner", foldOnly: true })
        })
      }
    })
  }
})

test.describe("N2 member-login roles", () => {
  test.use({ storageState: memberState })

  test.afterAll(async () => {
    await restoreRoles()
    const sb = sandbox()
    await sb.client.from("profiles").update({ needs_grad_check: false }).eq("id", await sb.memberUserId())
  })

  for (const role of ["member", "visitor"] as Role[]) {
    test(`home as ${role}`, async ({ page }) => {
      await setRole("member", role)
      await homeForRole(page, role)
      if (role === "member") {
        await attempt(page, "N2.13", role, async () => {
          const sb = sandbox()
          await sb.client.from("profiles").update({ needs_grad_check: true }).eq("id", await sb.memberUserId())
          await goHome(page)
          await page.waitForTimeout(800)
          await capture(page, "N2.13", { role, state: STATE, label: "Grad prompt", foldOnly: true })
          await sb.client.from("profiles").update({ needs_grad_check: false }).eq("id", await sb.memberUserId())
        })
      }
    })
  }

  test("unreachable shell surfaces", async ({ page }) => {
    skip(page, "N2.9", "member", "Super switcher is gated on the founder UUID; no test login can render it. Review from code + Brian's own screen.")
    skip(page, "N2.14", "member", "Pending veil / pull-to-refresh are transient gesture states; reviewed from code.")
  })
})
