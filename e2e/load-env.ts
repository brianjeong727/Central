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

  // ── Lane overlay ──────────────────────────────────────────────────────────────
  // Parallel verification lanes: slot s2 (port 3002) runs against its OWN sandbox
  // tenant so concurrent gates never collide in one ministry (lessons.md
  // "Serialize verification tracks" — this removes the reason to serialize).
  // E2E_LANE=2 (or E2E_PORT=3002) swaps the three identity vars to the *_LANE2 set.
  const lane = process.env.E2E_LANE ?? (process.env.E2E_PORT === "3002" ? "2" : "1")
  if (lane === "2") {
    for (const k of ["E2E_MINISTRY_ID", "E2E_ADMIN_EMAIL", "E2E_MEMBER_EMAIL"] as const) {
      const v = process.env[`${k}_LANE2`]
      if (!v) throw new Error(`[e2e] lane 2 requested but ${k}_LANE2 missing from .env.local`)
      process.env[k] = v
    }
  }

  applySupabaseTarget()
}

// ── Supabase target overlay ───────────────────────────────────────────────────
// Point the harness at a DIFFERENT Supabase project (a branch database, or a
// throwaway one) instead of production.
//
// Why this exists: the suite is not a read-only observer. Every run signs in
// twice, creates chat groups and seeds messages — one spec seeds 40 rows per
// run. Run the full suite a dozen times in an afternoon and that is a burst of
// database writes far heavier than real usage, aimed at the same project real
// users are on. On 2026-08-08 that contributed to draining the project's disk
// IO budget, which drops the instance to baseline throughput and made Supabase
// Auth stop responding — the live app hung on launch for everyone, because it
// waits on auth before it can render.
//
// Set E2E_SUPABASE_URL (plus the two keys) in .env.local and the harness AND the
// dev server it drives both point elsewhere. Unset — the default — nothing
// changes and it runs against the same project as before.
function applySupabaseTarget(): void {
  const url = process.env.E2E_SUPABASE_URL
  if (!url) return

  // All three or none. A half-applied target is the worst outcome: fixtures
  // writing to the branch while the app reads production reads as "the data I
  // just seeded isn't there", which looks like a product bug for as long as it
  // takes to notice.
  const anon = process.env.E2E_SUPABASE_ANON_KEY
  const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
  const missing = [
    !anon && "E2E_SUPABASE_ANON_KEY",
    !service && "E2E_SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(
      `[e2e] E2E_SUPABASE_URL is set but ${missing.join(" and ")} missing — ` +
      `refusing to run half-targeted (fixtures would write to one project while the app reads another).`,
    )
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon
  process.env.SUPABASE_SERVICE_ROLE_KEY = service

  // Loud on purpose. The failure mode of a silent target switch — seeding one
  // project and asserting against another — costs far more than a log line.
  console.log(`[e2e] Supabase target: ${new URL(url).host} (E2E_SUPABASE_URL override)`)
}

/**
 * The Supabase project the harness will use, for callers that need to show or
 * check it (scripts/dev-e2e.sh mirrors this into the dev server's env).
 */
export function e2eSupabaseHost(): string {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return url ? new URL(url).host : "(unset)"
}
