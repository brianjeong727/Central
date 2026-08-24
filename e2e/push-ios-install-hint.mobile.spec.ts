import { test, expect } from "@playwright/test"
import { memberState } from "./fixtures"

// Apple exposes PushManager to INSTALLED apps only — the native shell or a
// Home-Screen PWA. So a member browsing joincentral.app in ordinary mobile Safari
// reports `supported: false` forever, and every layer below behaves correctly while
// that member receives nothing.
//
// What made it the app's fault: the row said "This browser doesn't support push
// notifications" — true, terminal, and blaming the browser — while nothing anywhere
// in the product mentioned that a native iOS app exists. 14 of Central's 63 members
// had the app; the rest sat behind that sentence.
//
// This asserts the row now names the ONE action that fixes it, and that the fix is
// scoped: a desktop browser without push must still get the plain message, because
// there is no app to send it to.
test.describe("iOS-Safari notifications row", () => {
  test.use({
    storageState: memberState,
    // An iPhone the member has NOT installed the app on. detectPlatform() reads the
    // UA; `navigator.standalone` is absent here, which is exactly the non-installed
    // case.
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  })

  // Headless Chromium ships PushManager, so the un-installed-iPhone state has to be
  // arranged rather than assumed. Removing it is what `pushSupported()` actually
  // checks, so this reproduces the real condition and not a mock of the outcome.
  async function stripPushApi(page: import("@playwright/test").Page) {
    await page.addInitScript(() => {
      // @ts-expect-error — deleting a platform global is the whole point.
      delete window.PushManager
    })
  }

  test("names the App Store instead of blaming the browser, and links to it", async ({ page }) => {
    await stripPushApi(page)
    await page.goto("/home?tab=profile&pset=notifications")

    // ProfileTab renders the notifications section TWICE — the mobile drill and the
    // desktop inline copy, the latter hidden by `md:` classes but present in the DOM.
    // Scope to the one actually on screen at this viewport rather than .first(),
    // which would pass on the copy nobody can see.
    const visible = { visible: true } as const
    await expect(page.getByText("Not available in Safari").filter(visible)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("iPhone only sends notifications to installed apps.").filter(visible)).toBeVisible()
    await expect(page.getByText("This browser doesn't support push notifications.").filter(visible)).toHaveCount(0)

    // The link must point at the REAL listing. This id came from Apple's bundle-id
    // lookup for `app.joincentral`, not from a guess — a store link to nowhere is
    // worse than no link, and nothing in the repo records it.
    const link = page.getByRole("link", { name: "Get Central on the App Store" }).filter(visible)
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute("href", "https://apps.apple.com/us/app/central-os/id6791196078")
  })

  test("the settings hub marks notifications Off, so the row is findable at all", async ({ page }) => {
    await stripPushApi(page)
    await page.goto("/home?tab=profile&pset=hub")

    // Phone width hides the whole notifications section behind an unlabelled gear.
    // A row reading just "Notifications" told a member nothing about whether they
    // were receiving anything — which is how someone sits in a live church with
    // notifications off and no idea.
    const row = page.locator('[data-pocket-row="Notifications"]')
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row).toContainText("Off")
  })

  test("a non-iPhone browser without push still gets the plain message, not a store link", async ({
    browser,
  }) => {
    // Same missing Push API, ordinary desktop UA. There is no app to point this
    // person at, so inviting them to the iOS App Store would be worse than saying
    // nothing — the scoping is the load-bearing half of this change.
    const context = await browser.newContext({
      storageState: memberState,
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    })
    const page = await context.newPage()
    await stripPushApi(page)
    await page.goto("/home?tab=profile&pset=notifications")

    const visible = { visible: true } as const
    await expect(
      page.getByText("This browser doesn't support push notifications.").filter(visible),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole("link", { name: "Get Central on the App Store" }).filter(visible),
    ).toHaveCount(0)
    await context.close()
  })
})
