import { test, expect } from "@playwright/test"

// Give is web-only in the native shell (App Store 3.2.2(iv): non-approved
// nonprofits may only collect funds OUTSIDE the app). The shell is detected by
// the "CentralShell" UA (capacitor.config.ts ios.appendUserAgent); every Give
// entry point is gated on it client-side (useIsNativeShell):
//   · home quick tile ("Support the ministry")
//   · desktop sidebar Home-section "Give" item
//   · getting-started checklist (its "offering" step navigates to Give)
//   · the GiveView render itself in home-app (backstop)
// Web surfaces (normal UA) keep Give exactly as-is — pinned by the control test.

const SHELL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CentralShell"

test.describe("shell UA hides Give — mobile home", () => {
  test.use({ userAgent: SHELL_UA, viewport: { width: 390, height: 844 } })

  test("no Give quick tile on /home", async ({ page }) => {
    await page.goto("/home")
    // Pocket home has no h1 — anchor on the bottom nav instead.
    await expect(page.getByRole("navigation").getByRole("button", { name: "Home" })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Support the ministry")).toHaveCount(0)
  })
})

test.describe("shell UA hides Give — desktop sidebar", () => {
  test.use({ userAgent: SHELL_UA, viewport: { width: 1440, height: 900 } })

  test("no Give item in the Home section rail", async ({ page }) => {
    await page.goto("/home")
    await expect(page.getByRole("button", { name: "Overview" })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("button", { name: "Give", exact: true })).toHaveCount(0)
  })
})

test.describe("shell UA gates Google sign-in on native config", () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    userAgent: SHELL_UA,
    viewport: { width: 390, height: 844 },
  })

  // Google in the shell uses the NATIVE sheet (web OAuth can't run in a
  // WKWebView), so the button shows only when NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID
  // is configured. Both this process and the dev server read .env.local, so the
  // expectation tracks the same switch the app uses.
  const googleConfigured = !!process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID

  test("/login welcome shows Apple; Google only when configured", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByRole("button", { name: "Continue with Apple" })).toBeVisible()
    if (googleConfigured) {
      await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible()
    } else {
      await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0)
    }
  })
})

test.describe("web control — Give and Google stay", () => {
  test("desktop /home keeps the Give rail item; /login keeps Google", async ({ page }) => {
    await page.goto("/home")
    await expect(page.getByRole("button", { name: "Overview" })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("button", { name: "Give", exact: true })).toBeVisible()

    await page.context().clearCookies()
    await page.goto("/login")
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Continue with Apple" })).toBeVisible()
  })
})
