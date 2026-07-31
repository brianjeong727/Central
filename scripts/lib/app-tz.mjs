// The app's date/time conversion layer (`lib/tz.ts`), made importable from the
// Node seed scripts.
//
// WHY THIS EXISTS
// Seed scripts write `calendar_events.start_date`/`end_date` — the same columns
// the app writes — so they must use the SAME convention: a true instant derived
// from a wall clock in the ministry's own timezone, plus `start_day`/`end_day`
// for all-day rows. Every fixture bug this repo has hit in that column came from
// a script owning a second, slightly-different copy of that rule (a hardcoded
// `+00:00`, a fixed `-04:00`, or `new Date(...).setHours()` in whatever zone the
// seeding machine happened to be in).
//
// `lib/tz.ts` is TypeScript and Node 20 cannot import TS directly — but the file
// is deliberately dependency-free, so transpiling it with the repo's own
// TypeScript compiler and importing the output gives scripts the REAL
// implementation rather than a mirror that can drift from it. No new dependency:
// `typescript` is already a devDependency (it is what `npx tsc` runs).
//
//   import tz from "./lib/app-tz.mjs"
//   tz.eventDateColumnsFromInputs({ allDay: false, startYMD, startHHMM, … }, zone)
import fs from "node:fs"
import ts from "typescript"

const source = fs.readFileSync(new URL("../../lib/tz.ts", import.meta.url), "utf8")
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText

// Exported as one namespace object so the seed scripts pick up anything added to
// `lib/tz.ts` later without this file needing an edit.
export default await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`)
