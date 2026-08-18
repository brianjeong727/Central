#!/usr/bin/env node
//
// check-role-domain.mjs — the DB's role domain must equal lib/roles.ts.
//
// THE DRIFT THIS EXISTS FOR: `profiles_role_check` allowed only
// admin/leader/member/visitor/pastor while lib/roles.ts had encoded deacon and
// elder in ADMIN_ROLES/STAFF_ROLES/LEADER_ROLES for months. Every gate, helper
// and policy in the app agreed those two roles existed; the one CHECK constraint
// standing in front of every service-role write did not. Nothing surfaced it —
// it took a user report ("only pastor works on admin signup"). The origin is
// supabase/visitor_role_migration.sql, an on-disk migration asserting a FOUR-role
// set that was superseded live and never written back; the on-disk *.sql files
// are not the schema.
//
// TWO HALVES, and the script says which ones ran:
//
//   A. STATIC (always) — every hardcoded role enum in the codebase must equal the
//      union of the lib/roles.ts tiers: the super switcher's MINISTRY_ROLES and
//      updateMemberRole's newRole parameter union (the two documented
//      "UI role-picker enum" nonconformers of Convention #2).
//
//   B. LIVE (whenever SUPABASE_SERVICE_ROLE_KEY is available) — probes the real
//      CHECK constraints on `profiles.role` and `user_ministries.role`.
//
// HOW THE LIVE PROBE CAN BE SAFE: it never writes. Each probe is an INSERT whose
// PRIMARY KEY duplicates an existing row, so Postgres evaluates CHECK constraints
// FIRST (ExecConstraints, before the heap tuple reaches the index) and the unique
// index aborts the statement immediately after. So:
//
//     role accepted by the CHECK  ->  23505 unique_violation   (nothing written)
//     role rejected by the CHECK  ->  23514 check_violation    (nothing written)
//
// Every outcome is a failed statement in its own PostgREST transaction; no row is
// ever inserted, no AFTER trigger (incl. notify_role_change) ever fires. Anything
// other than those two SQLSTATEs is reported as INCONCLUSIVE and FAILS — a probe
// that can't tell the two apart must never pass quietly.
//
// WHY BEHAVIOURAL, NOT TEXTUAL: reading pg_get_constraintdef() would mean parsing
// a definition Postgres normalises on its own terms (ANY (ARRAY[...]) with ::text
// casts, its own whitespace, its own ordering) — and PostgREST cannot reach
// pg_catalog anyway, so with only the service-role key there is no read path to
// the definition at all. Asking the constraint what it ACCEPTS is both reachable
// and immune to how it happens to be spelled.
//
// LIMIT, stated plainly: the probe proves every role in lib/roles.ts is accepted
// and that clearly-invalid values are rejected (which is what catches a dropped
// or narrowed constraint). It cannot enumerate an EXTRA value the constraint
// might also allow beyond the controls it tries. That direction has never been
// the failure mode: the DB has always been the narrow side.

import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (p) => readFileSync(join(ROOT, p), "utf8")

// ── .env.local loader (same shape as e2e/load-env.ts — no dotenv dependency) ──
// Never overrides a value already in the environment, so CI secrets win.
function loadEnvLocal() {
  const path = join(ROOT, ".env.local")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, k, raw] = m
    if (process.env[k]) continue
    process.env[k] = raw.replace(/^["']|["']$/g, "")
  }
}
loadEnvLocal()

const fail = (msg) => {
  console.error(`✗ role-domain: ${msg}`)
  process.exit(1)
}
const setEq = (a, b) => a.size === b.size && [...a].every((v) => b.has(v))
const show = (s) => [...s].sort().join(", ")

// ── A. the canonical union, from lib/roles.ts ────────────────────────────────
const rolesSrc = read("lib/roles.ts")
const TIERS = ["ADMIN_ROLES", "STAFF_ROLES", "LEADER_ROLES", "CHAT_MANAGE_ROLES", "MEMBER_TIER"]
const union = new Set()
for (const name of TIERS) {
  const m = rolesSrc.match(new RegExp(`export const ${name}\\s*=\\s*\\[([^\\]]*)\\]`))
  if (!m) fail(`lib/roles.ts no longer exports ${name} as an array literal — this guard cannot read it.`)
  const values = [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1])
  if (values.length === 0) fail(`lib/roles.ts ${name} parsed as empty`)
  values.forEach((v) => union.add(v))
}

// ── A. hardcoded role enums elsewhere in the codebase ────────────────────────
const superSrc = read("app/actions/super-constants.ts")
const msMatch = superSrc.match(/export const MINISTRY_ROLES\s*=\s*\[([^\]]*)\]/)
if (!msMatch) fail("app/actions/super-constants.ts no longer exports MINISTRY_ROLES as an array literal")
const ministryRoles = new Set([...msMatch[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]))
if (!setEq(ministryRoles, union)) {
  fail(
    `MINISTRY_ROLES (app/actions/super-constants.ts) != lib/roles.ts union\n` +
    `    roles.ts:        ${show(union)}\n` +
    `    MINISTRY_ROLES:  ${show(ministryRoles)}`
  )
}

const ministrySrc = read("app/actions/ministry.ts")
const umrMatch = ministrySrc.match(/updateMemberRole\s*\(\s*targetUserId:\s*string,\s*newRole:\s*([^)]+)\)/)
if (!umrMatch) fail("app/actions/ministry.ts updateMemberRole signature no longer matches — this guard cannot read its role union")
const updateMemberRoleUnion = new Set([...umrMatch[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]))
if (!setEq(updateMemberRoleUnion, union)) {
  fail(
    `updateMemberRole's newRole union (app/actions/ministry.ts) != lib/roles.ts union\n` +
    `    roles.ts:          ${show(union)}\n` +
    `    updateMemberRole:  ${show(updateMemberRoleUnion)}`
  )
}

console.log(`✓ role-domain [static]: ${union.size} roles (${show(union)}) — MINISTRY_ROLES + updateMemberRole agree`)

// ── B. live constraint probe ─────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  // Loud, not silent. The static half above still ran and can still fail, but the
  // DB half — the one this guard exists for — did NOT.
  console.log("! role-domain [live]: SKIPPED — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.")
  console.log("  The DB constraint was NOT checked on this run. Only code-to-code parity was.")
  process.exit(0)
}

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
}

async function get(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H })
  if (!r.ok) return null
  return r.json()
}

// Returns the SQLSTATE of the (always-failing) insert.
async function probe(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  })
  const text = await r.text()
  if (r.ok) return { code: "INSERTED", text } // must never happen — the PK collides
  let parsed = {}
  try { parsed = JSON.parse(text) } catch { /* non-JSON error body */ }
  return { code: parsed.code ?? `HTTP_${r.status}`, text: (parsed.message ?? text).slice(0, 160) }
}

// Values that no formulation of the constraint should ever accept. Deliberately
// NOT case-variants of real roles: whether the CHECK is case-sensitive is a
// separate question this guard has no opinion on.
const CONTROLS = ["__role_domain_probe__", "owner", "superadmin"]

const ACCEPTED = "23505" // unique_violation — the CHECK passed, the PK collided
const REJECTED = "23514" // check_violation — the CHECK rejected the value

const sampleProfile = await get("profiles?select=id&limit=1")
const sampleMembership = await get("user_ministries?select=id,user_id,ministry_id&limit=1")

const targets = []
if (sampleProfile?.[0]?.id) {
  const id = sampleProfile[0].id
  targets.push({
    table: "profiles",
    row: (role) => ({
      id,
      name: "role-domain probe",
      email: "role-domain-probe@invalid.test",
      role,
      needs_grad_check: false,
      show_journal_entries: true,
      show_journal_streak: true,
      seen_workspace_nav_hint: false,
      grad_prompt_dismissed: false,
      compact_sidebar: false,
      open_groups_card_dismissed: false,
      notification_settings: {},
    }),
  })
}
if (sampleMembership?.[0]?.id) {
  const { id, user_id, ministry_id } = sampleMembership[0]
  targets.push({ table: "user_ministries", row: (role) => ({ id, user_id, ministry_id, role }) })
}

if (targets.length < 2) {
  fail(
    "live probe could not run — no sample row available in profiles and/or user_ministries " +
    "(or the service key was rejected). Not passing on an unverified constraint."
  )
}

const problems = []
for (const { table, row } of targets) {
  for (const role of union) {
    const { code, text } = await probe(table, row(role))
    if (code === ACCEPTED) continue
    if (code === REJECTED) {
      problems.push(`${table}.role REJECTS "${role}" — the DB constraint is narrower than lib/roles.ts`)
    } else {
      problems.push(`${table}.role probe INCONCLUSIVE for "${role}": ${code} ${text}`)
    }
  }
  for (const role of CONTROLS) {
    const { code, text } = await probe(table, row(role))
    if (code === REJECTED) continue
    if (code === ACCEPTED) {
      problems.push(`${table}.role ACCEPTS "${role}" — the role CHECK constraint is missing or too wide`)
    } else {
      problems.push(`${table}.role control probe INCONCLUSIVE for "${role}": ${code} ${text}`)
    }
  }
}

if (problems.length > 0) {
  console.error("✗ role-domain [live]: the DB role domain does not match lib/roles.ts")
  problems.forEach((p) => console.error(`    ${p}`))
  console.error("")
  console.error("  lib/roles.ts is the code encoding of permissions.md; the CHECK constraints on")
  console.error("  profiles.role and user_ministries.role must accept exactly that set. Fix the DB")
  console.error("  via the Supabase MCP (DROP + ADD in ONE transaction — a split leaves profiles.role")
  console.error("  unvalidated, and that CHECK is the only DB-side validation of a service-role write).")
  process.exit(1)
}

console.log(`✓ role-domain [live]: profiles.role + user_ministries.role accept exactly the ${union.size} roles in lib/roles.ts (${CONTROLS.length} controls rejected on each)`)
