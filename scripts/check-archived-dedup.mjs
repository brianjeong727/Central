#!/usr/bin/env node
//
// check-archived-dedup.mjs — static guard for the archived-chat dedup rule.
//
// THE RULE: `groups.archived = true` is a STASH, not a delete. Any read of `groups`
// that feeds a creation / membership / dedup decision MUST exclude archived rows, or
// the caller converges on the stashed row and resurrects a read-only room as a live
// chat (the bug fixed in PR #252, guarded end-to-end by e2e/archived-chat-dedup.spec.ts).
//
// WHY STATIC: there are 13 such reads across 8 entry points. Writing 13 browser specs to
// cover them is not worth it — and would still not cover the 14th read someone adds next
// month, which is exactly how this bug recurs. One structural assertion covers all of
// them plus every future one, and runs on every verify.sh (not just --e2e).
//
// ESCAPE HATCH: a read that legitimately includes archived rows must say so on the chain:
//
//     // archived-ok: <reason>
//     const { data } = await admin.from("groups").select("id")…
//
// That keeps every exception self-documenting and reviewable in the diff, instead of
// living in a line-number allowlist here that silently rots.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const TARGET = "app/actions/auto-chats.ts"
const src = readFileSync(join(ROOT, TARGET), "utf8")
const lines = src.split("\n")

/**
 * Collect the full supabase chain starting at the line containing `.from("groups")`.
 * A chain continues while following lines are method calls (`.select(...)`, `.eq(...)`,
 * `.or(...)`, `.maybeSingle()`, …). Chains written entirely on one line are handled by
 * the same walk, which simply stops immediately.
 */
function chainAt(startIdx) {
  let text = lines[startIdx]
  let end = startIdx
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (!/^\s*\./.test(lines[i])) break
    text += " " + lines[i].trim()
    end = i
  }
  return { text, end }
}

/** Look back a few lines for an `// archived-ok:` annotation on this chain. */
function hasAnnotation(startIdx) {
  for (let i = startIdx; i >= Math.max(0, startIdx - 6); i--) {
    if (/\/\/\s*archived-ok:/.test(lines[i])) return true
    // Stop at a blank line — the annotation must sit on the chain, not drift up.
    if (i < startIdx && lines[i].trim() === "") break
  }
  return false
}

const offenders = []
let reads = 0
let filtered = 0
let exempt = 0

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].includes('.from("groups")')) continue
  const { text } = chainAt(i)

  // Writes are not dedup reads. `.insert(…).select("id")` is a RETURNING clause, not a
  // lookup — matching on `.select(` alone would flag every insert in the file.
  if (/\.(insert|update|delete|upsert)\(/.test(text)) continue
  if (!/\.select\(/.test(text)) continue
  reads++

  // Satisfied by the shared constant, or by an equivalent inline filter — the archiving
  // paths themselves legitimately spell it `.eq("archived", false)`.
  if (/NOT_ARCHIVED/.test(text) || /\.eq\(\s*["']archived["']\s*,\s*false\s*\)/.test(text)) { filtered++; continue }

  // A read keyed on the primary key is fetching a row the caller already identified — it
  // cannot "converge" on a stashed row, so the archived state is not its business.
  if (/\.eq\(\s*["']id["']\s*,/.test(text)) { exempt++; continue }

  if (hasAnnotation(i)) { exempt++; continue }

  offenders.push({ line: i + 1, snippet: text.replace(/\s+/g, " ").trim().slice(0, 110) })
}

const label = `${TARGET}: ${reads} groups reads — ${filtered} filtered, ${exempt} annotated exempt`

if (offenders.length > 0) {
  console.error(`✗ archived-dedup: ${offenders.length} unguarded groups read(s)\n`)
  for (const o of offenders) {
    console.error(`  ${TARGET}:${o.line}`)
    console.error(`    ${o.snippet}\n`)
  }
  console.error("  Every groups read feeding a creation/membership decision must carry")
  console.error("  .or(NOT_ARCHIVED), or be annotated `// archived-ok: <reason>` if it")
  console.error("  intentionally includes archived rows. Archived is a stash, not a delete —")
  console.error("  an unfiltered dedup read resurrects a stashed chat (PR #252).")
  process.exit(1)
}

console.log(`✓ archived-dedup: ${label}`)
