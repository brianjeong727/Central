import { test, expect, type Page } from "@playwright/test"
import { sandbox } from "./fixtures"

// B3 mobile entry flow — /login's two-step welcome→form flow, /ministries'
// first mobile tree, and the native-only EntrySplash. Desktop must stay
// pixel-identical (asserted by presence of the original SplitShell / top-bar
// tree and absence of the mobile-only tree).
//
// NOTE: both the "hidden md:block" (desktop) and "md:hidden" (mobile) trees
// are ALWAYS in the DOM simultaneously — Tailwind hides the inactive one via
// CSS, it doesn't unmount it. So every assertion below is scoped to the tree
// that should be VISIBLE at the current viewport, to avoid strict-mode
// "resolved to N elements" violations across the two co-mounted trees.
//
// Console-error watcher: every test wires this so a caught/no-op rejection
// from @capacitor/splash-screen (expected on web) is fine, but an uncaught
// pageerror or console "error" mentioning splash-screen is a real FAIL.
function watchConsole(page: Page) {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`)
  })
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  return errors
}

const SHELL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CentralShell"

const SIGNED_OUT = { cookies: [], origins: [] }

// Scoped-tree helpers — the visible mobile ("md:hidden") or desktop
// ("hidden md:block") wrapper on the current page.
function mobileTree(page: Page) {
  // Both the SplitShell (desktop) internal markup and the true mobile wrapper
  // carry a "md:hidden" class; filter to the one actually laid out/visible.
  return page.locator(".md\\:hidden").filter({ visible: true })
}
function desktopTree(page: Page) {
  return page.locator(".hidden.md\\:block").filter({ visible: true })
}

test.describe("B3 /login — mobile (390x844), signed out", () => {
  test.use({ viewport: { width: 390, height: 844 }, storageState: SIGNED_OUT })

  test("1. welcome step renders; no desktop shell; no splash", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/login")
    const mobile = mobileTree(page)

    // Mobile welcome step landmarks.
    await expect(mobile.getByText("Central", { exact: true })).toBeVisible()
    await expect(mobile.getByText("One home for your ministry.")).toBeVisible()
    await expect(mobile.getByText(/Be still, and know that I am God/)).toBeVisible()
    await expect(mobile.getByRole("button", { name: "Continue with Google" })).toBeVisible()
    await expect(mobile.getByRole("button", { name: "Continue with email" })).toBeVisible()
    await expect(mobile.getByText("New here?")).toBeVisible()

    // Desktop SplitShell must not be visible (hidden md:block wrapper).
    await expect(desktopTree(page)).not.toBeVisible()

    // No splash overlay — browser UA lacks "CentralShell".
    await expect(page.locator(".es-root")).toHaveCount(0)

    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })

  test("2+3. Continue with email -> form step -> Back -> welcome step", async ({ page }) => {
    await page.goto("/login")
    const mobile = mobileTree(page)
    await mobile.getByRole("button", { name: "Continue with email" }).click()

    // Form step landmarks.
    await expect(mobile.getByText("Sign in", { exact: true }).first()).toBeVisible()
    await expect(mobile.getByRole("heading", { name: "Welcome back." })).toBeVisible()
    await expect(mobile.getByPlaceholder("you@university.edu")).toBeVisible()
    await expect(mobile.getByPlaceholder("••••••••")).toBeVisible()
    await expect(mobile.getByRole("link", { name: "Forgot password?" })).toBeVisible()
    await expect(mobile.getByRole("button", { name: "Sign in" })).toBeVisible()

    // Back returns to welcome step.
    await mobile.getByRole("button", { name: "Back" }).click()
    await expect(mobile.getByText("One home for your ministry.")).toBeVisible()
    await expect(mobile.getByRole("button", { name: "Continue with email" })).toBeVisible()
  })

  test("7. ?error=no-account lands directly on the form step with error visible", async ({ page }) => {
    await page.goto("/login?error=no-account")
    const mobile = mobileTree(page)
    await expect(mobile.getByRole("heading", { name: "Welcome back." })).toBeVisible()
    await expect(
      mobile.getByText("No Central account exists for that Google email yet — create an account first."),
    ).toBeVisible()
  })
})

test.describe("B3 /login — mobile sign-in via form", () => {
  test.use({ viewport: { width: 390, height: 844 }, storageState: SIGNED_OUT })

  test("4. sign in with sandbox creds via mobile form lands on /home or /pick-ministry", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL
    const password = process.env.E2E_PASSWORD
    if (!email || !password) throw new Error("missing E2E_ADMIN_EMAIL / E2E_PASSWORD")

    await page.goto("/login")
    const mobile = mobileTree(page)
    await mobile.getByRole("button", { name: "Continue with email" }).click()
    await mobile.getByPlaceholder("you@university.edu").fill(email)
    await mobile.getByPlaceholder("••••••••").fill(password)
    await mobile.getByRole("button", { name: "Sign in" }).click()

    await page.waitForURL(/\/(home|pick-ministry)/, { timeout: 30_000 })
    console.log(`[B3 item 4] landed on: ${page.url()}`)
    await expect(page).toHaveURL(/\/(home|pick-ministry)/)
  })
})

test.describe("B3 /login — desktop (1440x900), signed out", () => {
  test.use({ viewport: { width: 1440, height: 900 }, storageState: SIGNED_OUT })

  test("8. original SplitShell renders; no mobile tree; no splash", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/login")
    const desktop = desktopTree(page)

    await expect(desktop.getByText("Sign in · Central")).toBeVisible()
    await expect(desktop.getByRole("heading", { name: "Welcome back." })).toBeVisible()
    await expect(desktop.getByRole("button", { name: "Continue with Google" })).toBeVisible()

    // Mobile tree (md:hidden wrapper) must not be visible.
    await expect(mobileTree(page)).not.toBeVisible()
    await expect(page.locator(".es-root")).toHaveCount(0)

    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })
})

test.describe("B3 /ministries — mobile (390x844), signed in (admin)", () => {
  test.use({ viewport: { width: 390, height: 844 } }) // inherits chromium project's admin storageState

  // The sandbox lane's admin account has no `user_ministries` row (only a
  // `profiles.ministry_id`), so the page's "Your ministries" section is
  // normally empty for this account — arrange one row so item 5/6 (the
  // section + its Open pill) is actually exercisable, then remove it.
  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const { error } = await sb.client
      .from("user_ministries")
      .upsert({ user_id: adminId, ministry_id: sb.ministryId, role: "admin" }, { onConflict: "user_id,ministry_id" })
    if (error) throw error
  })
  test.afterAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const { error } = await sb.client
      .from("user_ministries")
      .delete()
      .eq("user_id", adminId)
      .eq("ministry_id", sb.ministryId)
    if (error) throw error
  })

  test("5+6. mobile ministries tree, single-replace tab switch, Open row -> /home", async ({ page }) => {
    const errors = watchConsole(page)
    await page.goto("/ministries")
    const mobile = mobileTree(page)

    await expect(mobile.getByRole("heading", { name: "Choose a ministry" })).toBeVisible()
    await expect(mobile.getByRole("button", { name: "Browse" })).toBeVisible()
    await expect(mobile.getByRole("button", { name: "Invite code" })).toBeVisible()
    await expect(mobile.getByText("Your ministries")).toBeVisible({ timeout: 10_000 })
    await expect(mobile.getByRole("button", { name: "Open" }).first()).toBeVisible()

    // Tab switch -> Invite code: URL gets ?tab=code, one router.replace (no
    // history-entry growth since replace doesn't push).
    const historyBefore = await page.evaluate(() => window.history.length)
    await mobile.getByRole("button", { name: "Invite code" }).click()
    await expect(page).toHaveURL(/\?tab=code/)
    const historyAfter = await page.evaluate(() => window.history.length)
    expect(historyAfter, "tab switch must be a single replace, not a push").toBe(historyBefore)
    await expect(mobile.getByPlaceholder("MERCY24")).toBeVisible()

    // Back to Browse.
    await mobile.getByRole("button", { name: "Browse" }).click()
    await expect(page).toHaveURL(/\?tab=browse/)
    await expect(mobile.getByText("Your ministries")).toBeVisible()

    // Open row -> /home.
    await mobile.getByRole("button", { name: "Open" }).first().click()
    await page.waitForURL(/\/home/, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/home/)

    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
  })
})

test.describe("B3 /ministries — desktop (1440x900), signed in (admin)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("9. original desktop layout renders; no mobile tree", async ({ page }) => {
    await page.goto("/ministries")
    const desktop = desktopTree(page)
    await expect(desktop.getByText("Discover · Central")).toBeVisible()
    await expect(desktop.getByRole("heading", { name: "Ministries" })).toBeVisible()
    await expect(desktop.getByPlaceholder("Search by name or university…")).toBeVisible()

    // Mobile tree must not be visible.
    await expect(mobileTree(page)).not.toBeVisible()
  })
})

test.describe("B3 EntrySplash — CentralShell UA (browser-simulated native)", () => {
  test.use({ storageState: SIGNED_OUT })

  test("10a. mobile viewport + CentralShell UA -> splash mounts then auto-dismisses (~4.2s+0.6s)", async ({ browser }) => {
    const context = await browser.newContext({
      userAgent: SHELL_UA,
      viewport: { width: 390, height: 844 },
    })
    const page = await context.newPage()
    const errors = watchConsole(page)
    await page.goto("/login")

    const splash = page.locator(".es-root")
    await expect(splash).toBeVisible({ timeout: 2000 })
    // Auto-dismiss: 4200ms timeout + 600ms fade, then unmounted (`mounted=false`).
    await expect(splash).toHaveCount(0, { timeout: 6000 })

    expect(
      errors.filter((e) => /splash-screen/i.test(e)),
      `splash-screen related errors (must be none / caught no-op only):\n${errors.join("\n")}`,
    ).toEqual([])

    // Reload in the SAME context: module-scope guard resets on a full reload,
    // so it MAY show again — this is observational, not a pass/fail gate.
    await page.reload()
    const showsAgainAfterReload = await splash.count().then((c) => c > 0)
    console.log(`[B3 item 10] splash visible again after same-context reload: ${showsAgainAfterReload}`)

    await context.close()
  })

  test("10b. tap-to-skip dismisses the splash early (fresh context)", async ({ browser }) => {
    const context = await browser.newContext({
      userAgent: SHELL_UA,
      viewport: { width: 390, height: 844 },
    })
    const page = await context.newPage()
    await page.goto("/login")

    const splash = page.locator(".es-root")
    await expect(splash).toBeVisible({ timeout: 2000 })
    const start = Date.now()
    await splash.click({ position: { x: 10, y: 10 } })
    await expect(splash).toHaveCount(0, { timeout: 1500 })
    const elapsed = Date.now() - start
    console.log(`[B3 item 10b] tap-to-skip dismissed after ${elapsed}ms (well under 4200ms auto-dismiss)`)
    expect(elapsed).toBeLessThan(4200)

    await context.close()
  })

  test("11. desktop viewport + CentralShell UA -> no splash (regression)", async ({ browser }) => {
    const context = await browser.newContext({
      userAgent: SHELL_UA,
      viewport: { width: 1440, height: 900 },
    })
    const page = await context.newPage()
    await page.goto("/login")
    await page.waitForLoadState("networkidle")
    // Mount effect runs synchronously after first paint; confirm it never
    // appears (poll-based, no fixed sleep).
    await expect(page.locator(".es-root")).toHaveCount(0)
    await context.close()
  })
})
