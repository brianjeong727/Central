// Emit the reviewer shot list for one network × viewport from the manifest.
//
//   node tours/shotlist.mjs N7 desktop [--all-roles] > findings/shotlist-N7-desktop.md
//
// Default keeps the review set tight: admin + member roles (pastor/leader/visitor
// only where a screen exists for them alone), the fold shot for every capture, the
// full shot only for base states. --all-roles includes every role's capture.
import { readFileSync } from "node:fs"

const OUT = process.env.DESIGN_PASS_OUT || ".claude/task-context/design-pass"
const [net, vp, ...flags] = process.argv.slice(2)
const allRoles = flags.includes("--all-roles")
const lines = readFileSync(`${OUT}/manifest.jsonl`, "utf8").trim().split("\n").map(l => JSON.parse(l))
  .filter(l => l.id.startsWith(net + ".") && l.viewport === vp && !l.skipped && !l.coveredBy)

// Latest capture per (id, role, state) wins (re-runs overwrite the same filename).
const latest = new Map()
for (const l of lines) latest.set(`${l.id}|${l.role}|${l.state}`, l)
const rows = [...latest.values()]
const idsByRole = {}
for (const r of rows) (idsByRole[r.id] ??= new Set()).add(r.role)

const keep = rows.filter(r => {
  if (allRoles) return true
  if (["admin", "member"].includes(r.role)) return true
  const roles = idsByRole[r.id]
  return !roles.has("admin") && !roles.has("member") // only-this-role screens (pastor-only, signed-out)
})
keep.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }) || a.role.localeCompare(b.role) || a.state.localeCompare(b.state))

let out = `# Shot list · ${net} · ${vp}\n\nRead EVERY file below with the Read tool. "full" is the same screen with its scroller unrolled — read it when the fold is cut off.\n\n`
for (const r of keep) {
  out += `- **${r.id}** · ${r.role} · ${r.state} · ${r.label}\n  - fold: ${r.fold}\n`
  if (r.full && (r.state === "populated" || r.state === "empty")) out += `  - full: ${r.full}\n`
  out += `  - measure: ${r.measure}\n`
}
out += `\n${keep.length} captures.\n`
process.stdout.write(out)
