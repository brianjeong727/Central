// Single-session login trace: logs every network request slower than 400ms
// and the big navigation milestones. Run: node scratchpad/login-trace.cjs
const fs = require("node:fs")
const path = require("node:path")
const { chromium } = require("@playwright/test")

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim()
  if (!t || t.startsWith("#")) continue
  const eq = t.indexOf("=")
  if (eq === -1) continue
  const k = t.slice(0, eq).trim()
  let v = t.slice(eq + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(k in process.env)) process.env[k] = v
}

const BASE = process.env.LOAD_BASE || "https://joincentral.app"

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  const t0 = Date.now()
  const mark = (label) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`)

  page.on("requestfinished", async (req) => {
    const timing = req.timing()
    const total = timing.responseEnd
    if (total > 400) {
      const u = new URL(req.url())
      console.log(
        `[+${((Date.now() - t0) / 1000).toFixed(1)}s] SLOW ${Math.round(total)}ms ${req.method()} ${u.host}${u.pathname.slice(0, 80)}`,
      )
    }
  })
  page.on("requestfailed", (req) => {
    const u = new URL(req.url())
    console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] FAILED ${req.method()} ${u.host}${u.pathname.slice(0, 80)} :: ${req.failure()?.errorText}`)
  })

  mark("goto /login")
  await page.goto(`${BASE}/login`, { waitUntil: "load" })
  mark("login page loaded")
  await page.getByPlaceholder("you@university.edu").fill(process.env.E2E_ADMIN_EMAIL)
  await page.getByPlaceholder("••••••••").fill(process.env.E2E_PASSWORD)
  mark("submit")
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL(/\/home/, { timeout: 60000 })
  mark("URL is /home")
  await page.waitForSelector("text=Messages", { timeout: 60000 })
  mark("shell rendered")
  await page.waitForLoadState("load")
  mark("full load event")
  await browser.close()
})().catch((e) => { console.error("FATAL", e.message); process.exit(1) })
