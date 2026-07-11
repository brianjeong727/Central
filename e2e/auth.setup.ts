import { test as setup, expect, type Page } from "@playwright/test"
import { loadEnv } from "./load-env"
import { adminState, memberState } from "./fixtures"

loadEnv()

// Log in through the REAL /login UI (email + password) and persist the
// cookie-based Supabase SSR session. Supabase sessions live in cookies, so
// Playwright storageState round-trips them cleanly for the other projects.
async function login(page: Page, email: string, password: string, statePath: string) {
  await page.goto("/login")
  await page.getByPlaceholder("you@university.edu").fill(email)
  await page.getByPlaceholder("••••••••").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  // handleLogin does window.location.assign("/home") once auth + ministry check
  // pass. Assert we actually landed before trusting the session.
  await page.waitForURL(/\/home/, { timeout: 30_000 })
  await expect(page).toHaveURL(/\/home/)
  await page.context().storageState({ path: statePath })
}

setup("authenticate admin", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) throw new Error("[auth.setup] missing E2E_ADMIN_EMAIL / E2E_PASSWORD")
  await login(page, email, password, adminState)
})

setup("authenticate member", async ({ page }) => {
  const email = process.env.E2E_MEMBER_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) throw new Error("[auth.setup] missing E2E_MEMBER_EMAIL / E2E_PASSWORD")
  await login(page, email, password, memberState)
})
