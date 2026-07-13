import { test, expect } from "@playwright/test"

// The native iOS shell (Capacitor) must NEVER show the public marketing landing page.
// Its WebView User-Agent carries "CentralShell" (capacitor.config.ts ios.appendUserAgent),
// which proxy.ts recognizes and redirects server-side at "/": signed-out → /login,
// signed-in → /home. Mobile Safari and every web surface (normal UA) keep the marketing
// page exactly as-is. This spec pins all three observable outcomes.
//
// Note: these exercise the SERVER-side mechanism (the UA redirect in proxy.ts) — the
// only piece reproducible in a headless browser. The client-side fallback in
// landing-page.tsx keys off `window.Capacitor`, which only exists inside the real
// Capacitor WebView, so it is intentionally out of scope here.

const SHELL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CentralShell"

test.describe("native shell skips the landing page (CentralShell UA)", () => {
  test.describe("signed out", () => {
    // Clear the project's admin storage state → genuinely unauthenticated. Shell UA +
    // 390x844 (iPhone) so the captured screenshot reflects the real shell surface.
    test.use({
      storageState: { cookies: [], origins: [] },
      userAgent: SHELL_UA,
      viewport: { width: 390, height: 844 },
    })

    test("GET / redirects to /login (no marketing)", async ({ page }) => {
      await page.goto("/")
      await expect(page).toHaveURL(/\/login/)
      // The marketing hero must not be present at all.
      await expect(
        page.getByRole("heading", { name: /To equip the saints for the work of ministry/ }),
      ).toHaveCount(0)
      // The login surface actually rendered.
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
      await page.screenshot({
        path: ".claude/task-context/shell-skip-landing/shell-ua-login-390x844.png",
      })
    })
  })

  test.describe("signed in (admin)", () => {
    // Inherits the chromium project's admin storageState; only the UA is overridden.
    test.use({ userAgent: SHELL_UA })

    test("GET / redirects to /home (no marketing)", async ({ page }) => {
      await page.goto("/")
      await expect(page).toHaveURL(/\/home/)
      await expect(
        page.getByRole("heading", { name: /To equip the saints for the work of ministry/ }),
      ).toHaveCount(0)
    })
  })
})

test.describe("web keeps the marketing landing page (normal UA)", () => {
  // Signed-out, ordinary browser UA (the project default UA has no "CentralShell").
  test.use({ storageState: { cookies: [], origins: [] } })

  test("GET / renders the marketing hero", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByRole("heading", { name: /To equip the saints for the work of ministry/ }),
    ).toBeVisible()
  })
})
