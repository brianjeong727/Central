// Google sign-in VISIBILITY in the native shell.
//
// Google blocks its web OAuth flow inside a WKWebView (disallowed_useragent), so
// the shell can only offer Google through the native SDK — which needs an iOS
// OAuth client ID. `googleNativeConfigured()` is `!!NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`,
// and the button is hidden in the shell whenever it is unset, so a user is never
// shown a button that would dead-end.
//
// The shell is detected purely by user agent (`isNativeShell` → UA contains
// "CentralShell"), so this runs on the web build with that UA spoofed. It tests the
// GATE, which is the part that lives in our code. It cannot test the handshake with
// Google or Supabase — that needs a real account tapping a real button on a device.
import { test, expect, type Page } from "@playwright/test"

const SHELL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CentralShell"

const CONFIGURED = !!process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID

/**
 * Land on a screen that actually carries the provider buttons. /login shows them
 * immediately; /signup opens on a role chooser (register a church vs join a
 * ministry) and the buttons live one step in, on both branches — this takes the
 * "join" branch, the one a volunteer would use.
 */
async function open(page: Page, route: string, branch: "Join a ministry" | "Register a church" = "Join a ministry") {
  await page.goto(route)
  await page.waitForTimeout(1500)
  const choice = page.getByText(branch, { exact: true }).filter({ visible: true }).first()
  if (await choice.count()) {
    await choice.click()
    await page.waitForTimeout(1200)
  }
  await page.waitForTimeout(1000)
}

// Every screen that offers a provider button. /signup has TWO branches behind its
// role chooser and they are separate JSX — the "register a church" one is easy to
// forget, and both shipped a gate that differed from their own desktop twin.
const SURFACES = [
  { route: "/login", branch: undefined },
  { route: "/signup", branch: "Join a ministry" as const },
  { route: "/signup", branch: "Register a church" as const },
]

for (const { route, branch } of SURFACES) {
  test.describe(`${route}${branch ? ` (${branch})` : ""} — provider buttons`, () => {
    test.describe("in the native shell", () => {
      test.use({ userAgent: SHELL_UA, viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } })

      test("Apple always shows; Google follows the iOS client ID", async ({ page }) => {
        await open(page, route, branch)

        // Apple is native-first and unconditional in the shell.
        await expect(
          page.getByRole("button", { name: /Apple/i }).filter({ visible: true }).first(),
          "Sign in with Apple must always render in the shell",
        ).toBeVisible({ timeout: 20_000 })

        const google = page.getByRole("button", { name: /Google/i }).filter({ visible: true })
        if (CONFIGURED) {
          await expect(
            google.first(),
            "NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID is set, so the shell must OFFER Google",
          ).toBeVisible({ timeout: 20_000 })
        } else {
          await expect(
            google,
            "without an iOS client ID the shell must HIDE Google — a visible button would dead-end on disallowed_useragent",
          ).toHaveCount(0)
        }
      })
    })

    test.describe("on the web", () => {
      test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } })

      test("Google always shows — web OAuth needs no native client", async ({ page }) => {
        await open(page, route, branch)
        await expect(
          page.getByRole("button", { name: /Google/i }).filter({ visible: true }).first(),
        ).toBeVisible({ timeout: 20_000 })
      })
    })
  })
}
