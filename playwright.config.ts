import { defineConfig, devices } from "@playwright/test"
import { readFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import { loadEnv } from "./e2e/load-env"

// Pull sandbox credentials into process.env before the config object is built.
// Workers inherit this environment when they spawn, so the setup project and the
// sandbox fixtures see the same values.
loadEnv()

// Slot ports are bound to the WORKTREE DIRECTORY (.claude/session-slots.json), so
// the default is derived from the directory rather than hardcoded. A hardcoded
// "3001" meant that forgetting E2E_PORT in any other slot silently ran the whole
// suite against a SIBLING slot's dev server — old code, wrong tenant — and the
// failures looked like your changes hadn't applied. That trap cost real time
// twice (see tasks/lessons.md "E2E harness targets E2E_PORT, not PORT").
// E2E_PORT still wins when set, so verify.sh --port and CI are unaffected.
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
    // Fall through — a missing or malformed slot file must not break the config.
  }
  return "3001"
}

const PORT = process.env.E2E_PORT || defaultPortForWorktree()

// Storage-state paths, mirrored from e2e/fixtures.ts. Kept as literals here so the
// config never imports the fixtures module (which would construct the Supabase
// client at config-eval time).
const ADMIN_STATE = "e2e/.auth/admin.json"

export default defineConfig({
  testDir: "e2e",
  // Shared tenant state → strictly serial. No cross-test parallelism.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // No webServer block: the slot dev server is managed externally (see
  // scripts/verify.sh). Tests REQUIRE a server already listening on E2E_PORT.
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Logs both sandbox users in through the real /login UI and writes storage
    // states the other projects load.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: ADMIN_STATE,
      },
      dependencies: ["setup"],
      // Desktop project runs everything except the setup file and any
      // mobile-only spec.
      testIgnore: [/auth\.setup\.ts/, /\.mobile\.spec\.ts$/],
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
        storageState: ADMIN_STATE,
      },
      dependencies: ["setup"],
      // Mobile project is available for future viewport-specific specs; it runs
      // only *.mobile.spec.ts so the desktop suites don't double-run at 390px.
      testMatch: /\.mobile\.spec\.ts$/,
    },
  ],
})
