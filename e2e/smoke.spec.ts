import { test, expect } from "@playwright/test"

// Smoke: as the admin session, the shell boots and the core tabs each render
// their distinctive landmark — with zero console/page errors across the run.
// Tabs are reached by their URL param (the app's own tab URL-state convention),
// which is a real navigation through home-app's lazy tab init.
test.describe("smoke (admin)", () => {
  test("home + core tabs render without console errors", async ({ page }) => {
    const errors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console: ${msg.text()}`)
    })
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))

    // Home — greeting heading (PageTitle h1).
    await page.goto("/home")
    await expect(
      page.getByRole("heading", { name: /Good (morning|afternoon|evening|night)/ }).first(),
    ).toBeVisible()

    // Announcements.
    await page.goto("/home?tab=announcements")
    await expect(page.getByRole("heading", { name: "Announcements" })).toBeVisible()

    // Chats — the Church | My Chats mode switcher.
    await page.goto("/home?tab=chats")
    await expect(page.getByText("My Chats").first()).toBeVisible()

    // Directory.
    await page.goto("/home?tab=directory")
    await expect(page.getByRole("heading", { name: "Directory" })).toBeVisible()

    expect(errors, `unexpected errors during smoke run:\n${errors.join("\n")}`).toEqual([])
  })
})
