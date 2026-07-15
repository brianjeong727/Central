import { test, expect, type Page } from "@playwright/test"

// Sign in with Apple (App Store 4.8) — verifies the Apple button is present
// above Google on every entry surface, the mobile welcome pill order, and that
// clicking "Continue with Apple" navigates toward Supabase's OAuth authorize
// endpoint with provider=apple. The flow can't COMPLETE locally — the Supabase
// Apple provider isn't configured yet (see .claude/task-context/appstore-siwa/
// context.md) — so navigation is intercepted/aborted just past the click, never
// followed through.
//
// Native ASAuthorization sheet (Capacitor plugin) needs a real device/simulator
// and is out of scope here (see context.md "What CANNOT be verified here").

const SIGNED_OUT = { cookies: [], origins: [] }

function desktopTree(page: Page) {
  return page.locator(".hidden.md\\:block").filter({ visible: true })
}
function mobileTree(page: Page) {
  return page.locator(".md\\:hidden").filter({ visible: true })
}

// Returns the DOM order index (lower = earlier) of two locators' first match,
// used to assert Apple renders above Google without relying on Y-coordinates
// (fine for both the desktop stacked buttons and the mobile pill list).
async function domOrderIndex(page: Page, scopeSelector: string, text: string): Promise<number> {
  return page.evaluate(
    ({ scopeSelector, text }) => {
      const scope = document.querySelectorAll(scopeSelector)
      const visibleScope = Array.from(scope).find((el) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      if (!visibleScope) return -1
      const all = Array.from(visibleScope.querySelectorAll("button, a"))
      return all.findIndex((el) => el.textContent?.includes(text))
    },
    { scopeSelector, text },
  )
}

test.describe("SIWA — /login desktop (1440x900), signed out", () => {
  test.use({ viewport: { width: 1440, height: 900 }, storageState: SIGNED_OUT })

  test("Apple button above Google, OrDivider, email+password form intact", async ({ page }) => {
    await page.goto("/login")
    const desktop = desktopTree(page)

    await expect(desktop.getByRole("button", { name: "Continue with Apple" })).toBeVisible()
    await expect(desktop.getByRole("button", { name: "Continue with Google" })).toBeVisible()

    const appleIdx = await domOrderIndex(page, ".hidden.md\\:block", "Continue with Apple")
    const googleIdx = await domOrderIndex(page, ".hidden.md\\:block", "Continue with Google")
    expect(appleIdx, "Apple button must precede Google in DOM order").toBeGreaterThanOrEqual(0)
    expect(googleIdx).toBeGreaterThanOrEqual(0)
    expect(appleIdx).toBeLessThan(googleIdx)

    // OrDivider
    await expect(desktop.getByText("or", { exact: true })).toBeVisible()

    // Email + password form intact
    await expect(desktop.getByPlaceholder("you@university.edu")).toBeVisible()
    await expect(desktop.getByPlaceholder("••••••••")).toBeVisible()
    await expect(desktop.getByRole("button", { name: "Sign in" })).toBeVisible()
  })

  test("clicking Continue with Apple navigates toward the Supabase authorize endpoint (provider=apple)", async ({ page, context }) => {
    await page.goto("/login")
    const desktop = desktopTree(page)

    let capturedUrl: string | null = null
    await context.route("**/auth/v1/authorize**", async (route) => {
      capturedUrl = route.request().url()
      // Abort — never let the flow actually reach Supabase/Apple. The provider
      // isn't configured yet; completing would 400.
      await route.abort("aborted")
    })

    await desktop.getByRole("button", { name: "Continue with Apple" }).click()

    await expect.poll(() => capturedUrl, {
      message: "expected navigation to Supabase authorize endpoint",
      timeout: 10_000,
    }).not.toBeNull()

    expect(capturedUrl).toContain("supabase.co/auth/v1/authorize")
    expect(capturedUrl).toContain("provider=apple")
  })
})

test.describe("SIWA — /login mobile (390x844), signed out", () => {
  test.use({ viewport: { width: 390, height: 844 }, storageState: SIGNED_OUT })

  test("welcome step: Apple pill, Google pill, Continue with email pill, in that order", async ({ page }) => {
    await page.goto("/login")
    const mobile = mobileTree(page)

    await expect(mobile.getByRole("button", { name: "Continue with Apple" })).toBeVisible()
    await expect(mobile.getByRole("button", { name: "Continue with Google" })).toBeVisible()
    await expect(mobile.getByRole("button", { name: "Continue with email" })).toBeVisible()

    const appleIdx = await domOrderIndex(page, ".md\\:hidden", "Continue with Apple")
    const googleIdx = await domOrderIndex(page, ".md\\:hidden", "Continue with Google")
    const emailIdx = await domOrderIndex(page, ".md\\:hidden", "Continue with email")
    expect(appleIdx).toBeGreaterThanOrEqual(0)
    expect(googleIdx).toBeGreaterThan(appleIdx)
    expect(emailIdx).toBeGreaterThan(googleIdx)
  })
})

test.describe("SIWA — /signup desktop (1440x900), signed out", () => {
  test.use({ viewport: { width: 1440, height: 900 }, storageState: SIGNED_OUT })

  // Unlike /login, /signup's SplitShell has no separate "hidden md:block" /
  // "md:hidden" tree split — it's one responsive layout (Tailwind grid-cols
  // collapses on mobile). So assertions here go straight against `page`.
  test("Register a church form: Apple above Google", async ({ page }) => {
    await page.goto("/signup")

    await page.getByRole("button", { name: /Register a church/ }).click()
    await expect(page.getByRole("heading", { name: "Register your church." })).toBeVisible()

    await expect(page.getByRole("button", { name: "Continue with Apple" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible()
    const appleIdx = await domOrderIndex(page, "body", "Continue with Apple")
    const googleIdx = await domOrderIndex(page, "body", "Continue with Google")
    expect(appleIdx).toBeGreaterThanOrEqual(0)
    expect(appleIdx).toBeLessThan(googleIdx)

    // Back to role-choice, then Join a ministry: Apple above Google there too.
    await page.getByRole("button", { name: "Back" }).click()
    await expect(page.getByRole("heading", { name: "How are you joining?" })).toBeVisible()
    await page.getByRole("button", { name: /Join a ministry/ }).click()
    await expect(page.getByRole("heading", { name: "Create your account." })).toBeVisible()

    await expect(page.getByRole("button", { name: "Continue with Apple" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible()
    const appleIdx2 = await domOrderIndex(page, "body", "Continue with Apple")
    const googleIdx2 = await domOrderIndex(page, "body", "Continue with Google")
    expect(appleIdx2).toBeGreaterThanOrEqual(0)
    expect(appleIdx2).toBeLessThan(googleIdx2)
  })
})
