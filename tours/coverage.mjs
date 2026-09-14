// Coverage report: every inventory ID × viewport → captured / covered-by /
// SKIPPED (reason) / MISSING. Reads inventory.md + manifest.jsonl.
//
//   node tours/coverage.mjs [--state populated|empty] [--md out.md]
import { readFileSync, writeFileSync } from "node:fs"

const OUT = process.env.DESIGN_PASS_OUT || ".claude/task-context/design-pass"
const args = process.argv.slice(2)
const stateArg = args.includes("--state") ? args[args.indexOf("--state") + 1] : null
const mdOut = args.includes("--md") ? args[args.indexOf("--md") + 1] : null

const inv = readFileSync(`${OUT}/inventory.md`, "utf8")
const ids = [...new Set(inv.match(/\bN\d+\.\d+(?:\.\d+)?\b/g))].filter(id => id !== "N7.3.2" || inv.includes("N7.3.2 Details"))
const byNet = {}
for (const id of ids) (byNet[id.split(".")[0]] ??= []).push(id)

const lines = readFileSync(`${OUT}/manifest.jsonl`, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l))
const rows = stateArg ? lines.filter(l => (l.state ?? "").startsWith(stateArg)) : lines

// IDs that exist on ONE viewport only (per inventory.md D / M markers); the other viewport is N/A, not missing.
const DESKTOP_ONLY = ["N2.1", "N2.1.1", "N2.1.2", "N2.1.3", "N2.3", "N2.3.1", "N2.3.2", "N2.3.3", "N2.3.4", "N2.3.5", "N2.3.6", "N2.6", "N3.1", "N4.2", "N4.7.12", "N5.1", "N5.4", "N7.1.2", "N7.5.1", "N7.5.2", "N7.9.1", "N8.10", "N1.9", "N1.13", "N10.1", "N2.11", "N2.10"]
const MOBILE_ONLY = ["N2.2", "N2.4", "N2.4.1", "N2.4.2", "N2.4.3", "N2.4.4", "N2.4.5", "N2.4.6", "N2.4.7", "N2.4.8", "N2.4.9", "N2.8", "N2.14", "N3.2", "N4.1", "N4.1.1", "N4.1.2", "N4.1.3", "N4.9", "N5.2", "N5.5", "N5.5.1", "N5.5.2", "N5.5.3", "N5.5.4", "N6.0", "N7.2.1", "N7.4.1", "N7.5.3", "N7.5.4", "N7.9.2", "N8.0", "N9.0"]
const na = (id, vp) => (vp === "mobile" && DESKTOP_ONLY.includes(id)) || (vp === "desktop" && MOBILE_ONLY.includes(id))
const status = {}
for (const r of rows) {
  const key = `${r.id}|${r.viewport}`
  const cur = status[key] ?? { captured: 0, covered: null, skipped: null, roles: new Set(), files: [] }
  if (r.skipped) cur.skipped = r.reason
  else if (r.coveredBy) cur.covered = r.coveredBy
  else { cur.captured++; cur.roles.add(r.role); cur.files.push(r.fold) }
  status[key] = cur
}

const cmp = (a, b) => a.split(".").map(Number).reduce((acc, n, i) => acc || (n - (b.split(".")[i] ?? -1)), 0) || a.localeCompare(b)
let md = `# Coverage${stateArg ? ` · ${stateArg}` : ""}\n\n`
const totals = { desktop: { captured: 0, covered: 0, skipped: 0, missing: 0 }, mobile: { captured: 0, covered: 0, skipped: 0, missing: 0 } }
for (const net of Object.keys(byNet).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
  md += `## ${net}\n\n| ID | desktop | mobile |\n|---|---|---|\n`
  for (const id of byNet[net].sort(cmp)) {
    const cells = ["desktop", "mobile"].map(vp => {
      const s = status[`${id}|${vp}`]
      if (!s && na(id, vp)) { totals[vp].na = (totals[vp].na ?? 0) + 1; return "n/a" }
      if (!s) { totals[vp].missing++; return "**MISSING**" }
      if (s.captured) { totals[vp].captured++; return `✓ ${s.captured} shot${s.captured > 1 ? "s" : ""} (${[...s.roles].join(", ")})` }
      if (s.covered) { totals[vp].covered++; return `↳ in ${s.covered}` }
      if (s.skipped) { totals[vp].skipped++; return `SKIPPED — ${s.skipped}` }
      totals[vp].missing++; return "**MISSING**"
    })
    md += `| ${id} | ${cells[0]} | ${cells[1]} |\n`
  }
  md += "\n"
}
md += `## Totals\n\n| viewport | captured | covered | skipped | n/a | missing |\n|---|---|---|---|---|---|\n`
for (const vp of ["desktop", "mobile"]) md += `| ${vp} | ${totals[vp].captured} | ${totals[vp].covered} | ${totals[vp].skipped} | ${totals[vp].na ?? 0} | ${totals[vp].missing} |\n`
md += `\nInventory IDs: ${ids.length}. Manifest rows considered: ${rows.length}.\n`
if (mdOut) writeFileSync(mdOut, md)
console.log(md)
