import { defineConfig, devices } from "@playwright/test"
import { loadEnv } from "./e2e/load-env"

// Pull sandbox credentials into process.env before the config object is built.
// Workers inherit this environment when they spawn, so the setup project and the
// sandbox fixtures see the same values.
loadEnv()

const PORT = process.env.E2E_PORT || "3001"

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
