// Design-pass capture rig — SEPARATE from the e2e suite on purpose.
//
// The tours under `tours/` are not regression tests: they walk every screen in
// one network of the app and write screenshots + measurement JSON for the design
// audit. Keeping them on their own config means `npx playwright test` (and
// verify.sh) never runs them, and they never count toward the suite's pass/fail.
//
//   DESIGN_PASS_OUT=.claude/task-context/design-pass \
//     npx playwright test -c playwright.design-pass.config.ts tours/<network>.tour.ts
//
// Auth reuses e2e/auth.setup.ts (the real /login UI) so the storage states are
// always fresh. Tenant + port resolution is identical to playwright.config.ts.
import { defineConfig, devices } from "@playwright/test"
import { readFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import { loadEnv } from "./e2e/load-env"

loadEnv()

function defaultPortForWorktree(): string {
  try {
    const slots = JSON.parse(
      readFileSync(resolve(__dirname, ".claude/session-slots.json"), "utf8"),
    ) as { mainPort?: number; slots: { dir: string; port: number }[] }
    const dir = basename(__dirname)
    const hit = slots.slots.find(s => s.dir === dir)
    if (hit) return String(hit.port)
    if (slots.mainPort) return String(slots.mainPort)
  } catch {
    // fall through
  }
  return "3001"
}

const PORT = process.env.E2E_PORT || defaultPortForWorktree()
const ADMIN_STATE = "e2e/.auth/admin.json"

export default defineConfig({
  testDir: ".",
  testMatch: [/tours\/.*\.tour\.ts$/, /e2e\/auth\.setup\.ts$/],
  testIgnore: [/node_modules/, /\.next/, /ios/, /android/],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A tour is long (dozens of screens × viewports × roles); give it room.
  timeout: 20 * 60 * 1000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  outputDir: ".claude/task-context/design-pass/test-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    screenshot: "off",
    // Animations off so every capture is the settled state, never a mid-transition frame.
    reducedMotion: "reduce",
    // Every click/fill fails fast instead of hanging a tour forever on an unactionable element.
    actionTimeout: 8_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        storageState: ADMIN_STATE,
      },
      dependencies: ["setup"],
      testMatch: /tours\/.*\.tour\.ts$/,
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        storageState: ADMIN_STATE,
      },
      dependencies: ["setup"],
      testMatch: /tours\/.*\.tour\.ts$/,
    },
  ],
})
