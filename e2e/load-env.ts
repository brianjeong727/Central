// Dependency-free .env.local loader for the Playwright harness.
//
// The slot dev server is managed externally, so this file NEVER touches the
// running app — it only pulls the sandbox credentials Playwright needs (test
// user emails/password, the sandbox ministry id, the Supabase service key) into
// process.env for the config, the auth setup, and the sandbox fixtures.
//
// Called at the top of playwright.config.ts (main process) and again from
// fixtures.ts (worker process) — idempotent, so the double call is harmless.
// No dotenv dependency by design; a tiny hand parser is enough for KEY=value.

import { readFileSync } from "node:fs"
import { join } from "node:path"

let loaded = false

export function loadEnv(): void {
  if (loaded) return
  loaded = true
  // process.cwd() is the repo root: playwright is always invoked from the
  // worktree top-level (verify.sh cds there; local runs start there too).
  const path = join(process.cwd(), ".env.local")
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    // .env.local is a gitignored symlink; if it's missing the fixtures'
    // requireEnv() guards will throw a clear error at first use.
    return
  }
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    // First definition wins; never clobber a value already in the environment
    // (e.g. E2E_PORT passed on the command line by verify.sh).
    if (!(key in process.env)) process.env[key] = val
  }
}
