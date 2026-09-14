// Seed the E2E sandbox tenant to FULL feature coverage for the design pass —
// every workspace kind, every event type in an upcoming state, receipts in every
// status, forms, polls, DGL rotation, bible study, congregation questions,
// journal entries, reports, audit rows, join requests… so every screen in the
// audit is seen with realistic content rather than a dashed empty box.
//
//   PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$PATH" \
//     node --env-file=.env.local scripts/seed-design-pass.mjs
//
// SANDBOXES ONLY: refuses any ministry whose name does not start with
// "E2E Sandbox". Idempotent by marker (title/name/email) — re-running adds
// nothing twice. Every row it creates is recorded in
// .claude/task-context/design-pass/seed-manifest.json for surgical cleanup.
import { createClient } from "@supabase/supabase-js"
import { mkdirSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import sharp from "sharp"
import { EVENT_PRESET_DATA, countdownPresetPhases } from "../app/home/event-presets-data.mjs"
import tz from "./lib/app-tz.mjs"

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MINISTRY_ID = process.env.DP_MINISTRY_ID || process.env.E2E_MINISTRY_ID
if (!URL_ || !KEY || !MINISTRY_ID) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / E2E_MINISTRY_ID")

const db = createClient(URL_, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const mid = MINISTRY_ID
const manifest = {}
const rec = (table, row) => { (manifest[table] ??= []).push(row.id ?? row); return row }
const die = (where, error) => { throw new Error(`${where}: ${error.message ?? error}`) }

// Storage host for public object URLs (image announcement, home slide, avatars).
const PUBLIC = `${URL_}/storage/v1/object/public`

// ── Tenant guard ─────────────────────────────────────────────────────────────
const { data: ministry, error: mErr } = await db.from("ministries").select("id,name,timezone").eq("id", mid).single()
if (mErr) die("ministry", mErr)
if (!/^E2E Sandbox/.test(ministry.name)) throw new Error(`Refusing to seed non-sandbox ministry "${ministry.name}"`)
const ZONE = tz.resolveMinistryTimezone(ministry.timezone)
console.log(`Seeding ${ministry.name} (${mid}) in ${ZONE}`)

// ── Dates ────────────────────────────────────────────────────────────────────
const todayYMD = tz.todayInZone(ZONE)
const ymdShift = (ymd, days) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10) }
const at = (ymd, hhmm) => tz.zonedTimeToISO(ymd, hhmm, ZONE)
const SEMESTER = (() => { const [y, m] = todayYMD.split("-").map(Number); return `${m >= 7 ? "fall" : "spring"}_${y}` })()
const FISCAL_YEAR = (() => { const [y, m] = todayYMD.split("-").map(Number); return m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}` })()

// ── Users ────────────────────────────────────────────────────────────────────
const { data: existingUsers } = await db.from("profiles").select("id,email,name,role").eq("ministry_id", mid)
const byEmail = Object.fromEntries(existingUsers.map(u => [u.email, u]))
const admin = byEmail["e2e.admin@test.com"]; const member = byEmail["e2e.member@test.com"]
if (!admin || !member) throw new Error("E2E admin/member missing — run scripts/seed-e2e.mjs first")

// Ghost profiles: profiles.id has no FK to auth.users, so these act as real
// people everywhere (senders, assignees, attendees) without a login.
const GHOSTS = [
  ["Grace Lee", "member", 2027, "female", "Nursing", "Philadelphia, PA"],
  ["Sarah Kim", "leader", 2026, "female", "Biology", "Fort Lee, NJ"],
  ["James Park", "leader", 2026, "male", "Computer Science", "Seattle, WA"],
  ["Daniel Cho", "member", 2028, "male", "Economics", "Los Angeles, CA"],
  ["Hannah Choi", "leader", 2027, "female", "Psychology", "Chicago, IL"],
  ["Joshua Nguyen", "member", 2027, "male", "Mechanical Engineering", "Houston, TX"],
  ["Rachel Yang", "member", 2028, "female", "Communications", "Pittsburgh, PA"],
  ["Kevin Tran", "deacon", null, "male", null, "Pittsburgh, PA"],
  ["Emily Wong", "member", 2029, "female", "Undeclared", "San Jose, CA"],
  ["David Chen", "member", 2026, "male", "Finance", "Edison, NJ"],
  ["Esther Han", "member", 2029, "female", "Pre-med", "Atlanta, GA"],
  ["Micah Lim", "visitor", 2029, "male", null, "Boston, MA"],
  ["Abigail Oh", "visitor", 2028, "female", null, "Toronto, ON"],
  ["Nathan Song", "member", 2027, "male", "Physics", "Denver, CO"],
  ["Lydia Kang", "member", 2026, "female", "Architecture", "Portland, OR"],
  ["Caleb Ryu", "member", 2028, "male", "Statistics", "Dallas, TX"],
  ["Chloe Shin", "member", 2029, "female", "English", "Cincinnati, OH"],
  ["Isaac Moon", "member", 2027, "male", "Bioengineering", "Baltimore, MD"],
  ["Naomi Bae", "member", 2028, "female", "Nursing", "Nashville, TN"],
  ["Samuel Jung", "member", 2026, "male", "Business", "Irvine, CA"],
  ["Anna Hwang", "member", 2029, "female", "Undeclared", "Columbus, OH"],
  ["Ethan Yoo", "member", 2027, "male", "Civil Engineering", "Raleigh, NC"],
  ["Mia Kwon", "member", 2028, "female", "Education", "Minneapolis, MN"],
  ["Elijah Seo", "member", 2029, "male", "Music", "Ann Arbor, MI"],
  ["Sophia Ahn", "member", 2026, "female", "Chemistry", "Queens, NY"],
  ["Jacob Im", "visitor", 2029, "male", null, "Cleveland, OH"],
  ["Olivia Paik", "member", 2027, "female", "Marketing", "Tampa, FL"],
  ["Andrew Yun", "member", 2028, "male", "Data Science", "Sacramento, CA"],
  ["Hope Jang", "member", 2029, "female", "Undeclared", "Harrisburg, PA"],
  ["Peter Kwak", "member", 2026, "male", "Accounting", "Bergen County, NJ"],
]
const VERSES = ["Philippians 4:6-7", "Isaiah 41:10", "Romans 8:28", "Psalm 23:1", "Jeremiah 29:11", "Proverbs 3:5-6"]
const SONGS = ["Goodness of God", "Build My Life", "Great Are You Lord", "How Great Thou Art", "Gratitude", "Firm Foundation"]
const slug = s => s.toLowerCase().replace(/[^a-z]+/g, ".")
const ghosts = {}
for (const [i, [name, role, grad, gender, major, hometown]] of GHOSTS.entries()) {
  const email = byEmail[`${slug(name)}@sandbox.test`] ? `${slug(name)}@sandbox.test` : `${slug(name)}@sandbox.test`
  let u = byEmail[email]
  if (!u) {
    const { data, error } = await db.from("profiles").insert({ id: randomUUID(),
      name, email, role, ministry_id: mid, graduation_year: grad, gender, major, hometown,
      needs_grad_check: false, favorite_verse: i % 3 === 0 ? VERSES[i % VERSES.length] : null,
      favorite_worship_song: i % 4 === 0 ? SONGS[i % SONGS.length] : null,
      bible_verse: i % 5 === 0 ? "Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go." : null,
    }).select("id,email,name,role").single()
    if (error) die(`ghost ${name}`, error)
    u = rec("profiles", data)
  } else if (u.role !== role) {
    await db.from("profiles").update({ role, major, hometown }).eq("id", u.id)
  }
  ghosts[name] = u
}
const g = n => ghosts[n].id
const people = [admin, member, ...Object.values(ghosts)]
const byName = Object.fromEntries(people.map(p => [p.name, p]))
// Fill in the two real accounts so the member sheet has something to show.
await db.from("profiles").update({ major: "Information Science", hometown: "Pittsburgh, PA", favorite_verse: "Lamentations 3:22-23", favorite_worship_song: "Goodness of God", bible_verse: "The steadfast love of the LORD never ceases; his mercies never come to an end; they are new every morning." }).eq("id", admin.id)
await db.from("profiles").update({ major: "Biology", hometown: "Cherry Hill, NJ", graduation_year: 2028 }).eq("id", member.id)

// A pending join request needs a REAL auth user (FK → auth.users): borrow the
// lane-2 sandbox's third account, which reads as a person switching ministries.
{
  const { data: joiner } = await db.from("profiles").select("id").eq("email", "e2e2.third@test.com").maybeSingle()
  if (joiner) {
    const { data: jr } = await db.from("ministry_join_requests").select("id").eq("ministry_id", mid).eq("user_id", joiner.id).maybeSingle()
    if (!jr) { const { data, error } = await db.from("ministry_join_requests").insert({ ministry_id: mid, user_id: joiner.id, status: "pending" }).select("id").single(); if (error) die("join request", error); rec("ministry_join_requests", data) }
  }
}

// ── Central chat membership (≥30 so the "Seen by N" grammar appears) ─────────
const { data: central } = await db.from("groups").select("id,name").eq("ministry_id", mid).eq("is_central_chat", true).single()
{
  const { data: gm } = await db.from("group_members").select("user_id").eq("group_id", central.id)
  const have = new Set(gm.map(x => x.user_id))
  const missing = people.filter(p => !have.has(p.id)).map(p => ({ group_id: central.id, user_id: p.id }))
  if (missing.length) { const { error } = await db.from("group_members").insert(missing); if (error) die("central members", error) }
}

// ── Ministry settings ────────────────────────────────────────────────────────
await db.from("ministries").update({
  moderation_settings: { enabled: true, behavior: "asterisk_first", strictness: "moderate", scope: "all", photo_enabled: false },
  location: "Pittsburgh, PA", size: "medium", universities: ["University of Pittsburgh", "Carnegie Mellon University"],
}).eq("id", mid)
for (const [name, abbreviation, sort_order] of [["University of Pittsburgh", "Pitt", 0], ["Carnegie Mellon University", "CMU", 1]]) {
  const { data: ex } = await db.from("ministry_schools").select("id").eq("ministry_id", mid).eq("name", name).maybeSingle()
  if (!ex) { const { data, error } = await db.from("ministry_schools").insert({ ministry_id: mid, name, abbreviation, sort_order }).select("id").single(); if (error) die("school", error); rec("ministry_schools", data) }
}
{
  const { data: ex } = await db.from("ministry_giving").select("id").eq("ministry_id", mid).maybeSingle()
  if (!ex) { const { data, error } = await db.from("ministry_giving").insert({ ministry_id: mid, zelle_name: "Central Campus Ministry", zelle_info: "give@centralcampus.org", updated_by: admin.id }).select("id").single(); if (error) die("giving", error); rec("ministry_giving", data) }
}
for (const [reference, text, order_index] of [
  ["Lamentations 3:22-23", "The steadfast love of the LORD never ceases; his mercies never come to an end; they are new every morning; great is your faithfulness.", 0],
  ["Psalm 46:10", "Be still, and know that I am God.", 1],
]) {
  const { data: ex } = await db.from("home_verses").select("id").eq("ministry_id", mid).eq("reference", reference).maybeSingle()
  if (!ex) { const { data, error } = await db.from("home_verses").insert({ ministry_id: mid, reference, text, order_index, created_by: admin.id }).select("id").single(); if (error) die("home verse", error); rec("home_verses", data) }
}

// ── Teams ────────────────────────────────────────────────────────────────────
async function findOrCreateTeam(name, extra, roles, members) {
  let { data: t } = await db.from("teams").select("id").eq("ministry_id", mid).eq("name", name).maybeSingle()
  if (!t) {
    const { data, error } = await db.from("teams").insert({ ministry_id: mid, name, created_by: admin.id, ...extra }).select("id").single()
    if (error) die(`team ${name}`, error); t = rec("teams", data)
  }
  const { data: existingRoles } = await db.from("team_roles").select("id,name").eq("team_id", t.id)
  const roleId = {}
  for (const r of existingRoles) roleId[r.name] = r.id
  for (const r of roles) {
    if (roleId[r.name]) continue
    const { data, error } = await db.from("team_roles").insert({ team_id: t.id, ...r }).select("id").single()
    if (error) die(`role ${name}/${r.name}`, error); roleId[r.name] = rec("team_roles", data).id
  }
  const { data: existingMembers } = await db.from("team_members").select("user_id").eq("team_id", t.id)
  const have = new Set(existingMembers.map(m => m.user_id))
  const rows = members.filter(([uid]) => !have.has(uid)).map(([uid, role]) => ({ team_id: t.id, user_id: uid, role_id: roleId[role], added_by: admin.id }))
  if (rows.length) { const { error } = await db.from("team_members").insert(rows); if (error) die(`members ${name}`, error) }
  return t.id
}

const boardId = await findOrCreateTeam("Student Org Board", { team_type: "standard", description: "The student leadership board — events, meetings, groups, rotations." }, [
  { name: "President", is_president: true, permissions: ["can_plan_events", "can_view_finances", "can_manage_members", "can_track_attendance", "can_manage_team"] },
  { name: "Secretary", permissions: ["can_plan_events", "can_manage_members", "can_track_attendance"] },
  { name: "Treasurer", permissions: ["can_view_finances", "can_plan_events"] },
  { name: "Event Coordinator", permissions: ["can_plan_events", "can_track_attendance"] },
], [[admin.id, "President"], [g("Sarah Kim"), "Secretary"], [g("James Park"), "Treasurer"], [g("Hannah Choi"), "Event Coordinator"], [g("Joshua Nguyen"), "Event Coordinator"], [member.id, "Event Coordinator"]])

const dglId = await findOrCreateTeam("Small Group Leaders", { team_type: "standard", description: "DGLs — small groups, the weekly rotation, and Bible study." }, [
  { name: "President", is_president: true, permissions: ["can_create_dgs", "can_view_dgs", "can_generate_bible_study", "can_manage_team", "can_plan_events"] },
  { name: "DGL", permissions: ["can_view_dgs"] },
], [[admin.id, "President"], [member.id, "DGL"], [g("Sarah Kim"), "DGL"], [g("James Park"), "DGL"], [g("Hannah Choi"), "DGL"], [g("David Chen"), "DGL"], [g("Lydia Kang"), "DGL"], [g("Samuel Jung"), "DGL"]])

const financeId = await findOrCreateTeam("Finance", { team_type: "finance", description: "Treasury — allocation, budget, and reimbursements." }, [
  { name: "Treasurer", is_president: true, permissions: ["can_view_finances", "can_audit_finances", "can_manage_team"] },
  { name: "Assistant Treasurer", permissions: ["can_view_finances"] },
], [[admin.id, "Treasurer"], [g("James Park"), "Assistant Treasurer"]])

const outreachId = await findOrCreateTeam("Campus Outreach", { team_type: "standard", description: "Tabling, involvement fairs, and welcome events across both campuses." }, [
  { name: "Lead", is_president: true, permissions: ["can_plan_events", "can_manage_team"] },
  { name: "Volunteer", permissions: ["can_plan_events"] },
], [[admin.id, "Lead"], [g("Rachel Yang"), "Volunteer"], [g("Nathan Song"), "Volunteer"], [g("Emily Wong"), "Volunteer"]])

// ── Finance funds (needed by event budget draws) ─────────────────────────────
const funds = {}
{
  const { data: ex } = await db.from("finance_funds").select("id,slug").eq("ministry_id", mid)
  for (const f of ex) funds[f.slug] = f.id
  for (const [k, [name, slug2, kind]] of [["Church", "church", "church"], ["Pitt SORC", "pitt", "external"], ["CMU JFC", "cmu", "external"]].entries()) {
    if (funds[slug2]) continue
    const { data, error } = await db.from("finance_funds").insert({ ministry_id: mid, name, slug: slug2, kind, order_index: k, is_active: true, created_by: admin.id }).select("id").single()
    if (error) die(`fund ${name}`, error); funds[slug2] = rec("finance_funds", data).id
  }
}

// ── Upcoming events with full plans (one per preset type) ────────────────────
async function upsertEvent(ev) {
  const { data: ex } = await db.from("calendar_events").select("id").eq("ministry_id", mid).eq("title", ev.title).maybeSingle()
  if (ex) return { id: ex.id, existed: true }
  const startYMD = ev.date, endYMD = ymdShift(ev.date, (ev.days ?? 1) - 1)
  const { data, error } = await db.from("calendar_events").insert({
    ministry_id: mid, team_id: ev.team_id ?? boardId, title: ev.title, description: ev.description ?? null, location: ev.location ?? null,
    start_date: ev.allDay ? at(startYMD, "00:00") : at(startYMD, ev.start ?? "19:00"),
    end_date: ev.allDay ? at(endYMD, "23:59") : at(endYMD, ev.end ?? "21:00"),
    all_day: !!ev.allDay, start_day: ev.allDay ? startYMD : null, end_day: ev.allDay ? endYMD : null,
    category: ev.category ?? "social", event_type: ev.type, created_by: admin.id, parent_event_id: ev.parent ?? null, recurring: !!ev.recurring,
  }).select("id").single()
  if (error) die(`event ${ev.title}`, error)
  return { id: rec("calendar_events", data).id, existed: false }
}

async function seedPlan(eventId, ev, opts = {}) {
  let { data: plan } = await db.from("event_plans").select("id,type_data").eq("calendar_event_id", eventId).maybeSingle()
  if (plan) return plan
  const cfg = EVENT_PRESET_DATA[ev.type]
  const { data, error } = await db.from("event_plans").insert({
    ministry_id: mid, calendar_event_id: eventId, created_by: admin.id,
    overview_notes: opts.notes ?? cfg.description ?? null, expected_turnout: opts.turnout ?? 60, budget_allocated: opts.budget ?? null,
    countdown_phases: countdownPresetPhases(opts.ladder ?? "short"), type_data: opts.type_data ?? {},
  }).select("id,type_data").single()
  if (error) die(`plan ${ev.title}`, error)
  plan = rec("event_plans", data)
  // Tasks from the preset phases, due dates relative to the event date. Past-due
  // tasks are mostly done (a plan in progress), a few left open so "overdue"
  // renders; a couple carry priority / pinned / a brief / a subtask.
  const assignees = opts.assignees ?? [admin.id, member.id, g("Sarah Kim"), g("James Park"), g("Hannah Choi")]
  let i = 0
  for (const phase of cfg.defaultPhases) {
    for (const t of phase.tasks) {
      const due = t.off === null || t.off === undefined ? null : ymdShift(ev.date, t.off)
      const past = due && due < todayYMD
      const completed = past ? (i % 4 !== 0) : (i % 9 === 0)
      const { data: task, error: tErr } = await db.from("event_tasks").insert({
        event_plan_id: plan.id, title: t.title, phase: phase.key, due_date: due, completed, completed_at: completed ? new Date().toISOString() : null,
        assigned_to: assignees[i % assignees.length], created_by: admin.id, sort_order: i,
        priority: i % 7 === 0 ? "high" : "none", pinned: i === 1,
        brief: i % 5 === 0 ? "Check last year's notes first — the venue changed the deposit policy." : null,
      }).select("id").single()
      if (tErr) die(`task ${t.title}`, tErr)
      rec("event_tasks", task)
      if (i === 2) {
        for (const sub of ["Draft the message", "Get it approved", "Post it"]) {
          const { data: s, error: sErr } = await db.from("event_tasks").insert({ event_plan_id: plan.id, title: sub, phase: phase.key, due_date: due, completed: false, assigned_to: assignees[1], created_by: admin.id, sort_order: i, parent_id: task.id }).select("id").single()
          if (sErr) die("subtask", sErr); rec("event_tasks", s)
        }
      }
      i++
    }
  }
  // Roles from the preset, most assigned.
  const roleIds = []
  for (const [k, r] of (cfg.defaultRoles ?? []).entries()) {
    const { data: role, error: rErr } = await db.from("event_roles").insert({ event_plan_id: plan.id, role_name: r.name, notes: r.notes ?? null, assigned_to: k % 4 === 3 ? null : assignees[(k + 1) % assignees.length], created_by: admin.id }).select("id,assigned_to").single()
    if (rErr) die(`role ${r.name}`, rErr); roleIds.push(rec("event_roles", role))
  }
  if (opts.confirmations) {
    const statuses = ["confirmed", "requested", "declined", "escalated"]
    for (const [k, r] of roleIds.filter(r => r.assigned_to).entries()) {
      const status = statuses[k % statuses.length]
      const { data, error } = await db.from("event_confirmations").insert({ ministry_id: mid, event_plan_id: plan.id, subject_type: "role", subject_id: r.id, user_id: r.assigned_to, status, round: status === "escalated" ? 2 : 1, requested_at: new Date(Date.now() - 36e5 * 30).toISOString(), responded_at: status === "requested" || status === "escalated" ? null : new Date().toISOString(), note: status === "declined" ? "Out of town that weekend" : null }).select("id").single()
      if (error) die("confirmation", error); rec("event_confirmations", data)
    }
  }
  if (opts.blocks) {
    for (const [k, b] of opts.blocks.entries()) {
      const { data, error } = await db.from("event_blocks").insert({ ministry_id: mid, event_plan_id: plan.id, day_index: b.day ?? 0, time_label: b.time, start_time: b.time, duration_min: b.min, title: b.title, owner_id: b.owner ?? null, brief: b.brief ?? null, sort_order: k, status: "pending", created_by: admin.id }).select("id").single()
      if (error) die("block", error); rec("event_blocks", data)
    }
  }
  if (opts.notes) {
    for (const n of opts.noteItems ?? []) { const { data, error } = await db.from("event_notes").insert({ event_plan_id: plan.id, content: n, created_by: admin.id }).select("id").single(); if (error) die("event note", error); rec("event_notes", data) }
  }
  if (opts.newFolks) {
    for (const [name, contact] of opts.newFolks) { const { data, error } = await db.from("event_new_folks").insert({ event_plan_id: plan.id, ministry_id: mid, name, contact, notes: "Met at the welcome table", assigned_dgl_id: g("Sarah Kim") }).select("id").single(); if (error) die("new folk", error); rec("event_new_folks", data) }
  }
  if (opts.draws) {
    for (const [fund, amount] of opts.draws) { const { data, error } = await db.from("event_budget_draws").insert({ ministry_id: mid, event_plan_id: plan.id, fund, amount, created_by: admin.id }).select("id").single(); if (error) die("draw", error); rec("event_budget_draws", data) }
  }
  return plan
}

const D = n => ymdShift(todayYMD, n)
const kickoff = { title: "Fall Kickoff Night", type: "ministry", category: "regular", date: D(9), start: "19:00", end: "21:30", location: "Cathedral of Learning, Room 232", description: "First big gathering of the semester — worship, a short message, and dessert after." }
const pumpkin = { title: "Pumpkin Patch Social", type: "social", category: "social", date: D(31), start: "13:00", end: "17:00", location: "Trax Farms", description: "Hayride, corn maze, and cider donuts. Carpools leave from the Union at 12:30." }
const coffeehouse = { title: "Fall Coffeehouse", type: "coffeehouse", category: "social", date: D(52), start: "19:30", end: "22:00", location: "Bellefield Hall Auditorium", description: "Open-mic night — acts, skits, and way too much coffee." }
const retreat = { title: "Fall Retreat", type: "retreat", category: "retreat", date: D(38), days: 3, allDay: true, location: "Camp Harmony", description: "Three days away. Theme: Rooted." }
const turkey = { title: "Turkey Bowl", type: "turkey_bowl", category: "social", date: D(67), start: "10:00", end: "14:00", location: "Schenley Oval", description: "The annual flag-football classic. Bring layers." }
const gan = { title: "Girls Appreciation Night", type: "appreciation_night", category: "social", date: D(45), start: "18:30", end: "21:00", location: "Rachel & Grace's apartment" }

const EV = {}
for (const ev of [kickoff, pumpkin, coffeehouse, retreat, turkey, gan]) EV[ev.title] = await upsertEvent(ev)

await seedPlan(EV[kickoff.title].id, kickoff, {
  turnout: 90, budget: 350, confirmations: true, notes: true,
  noteItems: ["Projector in 232 is HDMI only — bring the adapter.", "Dessert order goes in by Wednesday."],
  newFolks: [["Priya S.", "priya@pitt.edu"], ["Marcus T.", "412-555-0142"], ["Wen L.", "wen@andrew.cmu.edu"]],
  draws: [["church", 200], ["pitt", 150]],
  blocks: [
    { time: "18:00", min: 45, title: "Setup — chairs, sound, welcome table", owner: g("Joshua Nguyen"), brief: "Welcome table by the door, not the stage." },
    { time: "18:45", min: 15, title: "Greeters in position", owner: g("Hannah Choi") },
    { time: "19:00", min: 25, title: "Worship set", owner: g("Sarah Kim") },
    { time: "19:25", min: 10, title: "Welcome + icebreaker", owner: admin.id },
    { time: "19:35", min: 30, title: "Message", owner: g("Kevin Tran") },
    { time: "20:05", min: 10, title: "Announcements + next steps", owner: admin.id },
    { time: "20:15", min: 60, title: "Dessert & hangout", owner: member.id },
    { time: "21:15", min: 15, title: "Teardown", owner: g("Joshua Nguyen") },
  ],
})
{
  const { data: kp } = await db.from("event_plans").select("id").eq("calendar_event_id", EV[kickoff.title].id).maybeSingle()
  const { count } = await db.from("event_budget_draws").select("*", { count: "exact", head: true }).eq("event_plan_id", kp.id)
  if (!count) { const { error } = await db.from("event_budget_draws").insert([["church", 200], ["pitt", 150]].map(([fund, amount]) => ({ ministry_id: mid, event_plan_id: kp.id, fund, amount, created_by: admin.id }))); if (error) die("draws", error) }
}
await seedPlan(EV[pumpkin.title].id, pumpkin, { turnout: 40, budget: 300 })
await seedPlan(EV[coffeehouse.title].id, coffeehouse, {
  turnout: 120, budget: 500, ladder: "long",
  type_data: { acts: [
    { id: "a1", performer: "Sarah & Lydia", type: "Duet", duration: "5 min", sound_check: "6:45" },
    { id: "a2", performer: "The Board", type: "Skit", duration: "8 min", sound_check: "6:55" },
    { id: "a3", performer: "Elijah Seo", type: "Piano", duration: "6 min", sound_check: "7:05" },
    { id: "a4", performer: "Class of 2029", type: "Dance", duration: "4 min", sound_check: "7:15" },
  ] },
})
await seedPlan(EV[retreat.title].id, retreat, {
  turnout: 75, budget: 4200, ladder: "long",
  type_data: { transport: [
    { id: "c1", driver_id: admin.id, vehicle: "Grey Sienna", seats: 7, rider_ids: [g("Grace Lee"), g("Daniel Cho"), g("Emily Wong"), g("Esther Han")] },
    { id: "c2", driver_id: g("James Park"), vehicle: "Blue Civic", seats: 4, rider_ids: [g("Nathan Song"), g("Caleb Ryu"), g("Isaac Moon")] },
    { id: "c3", driver_id: g("Hannah Choi"), vehicle: "White RAV4", seats: 5, rider_ids: [g("Rachel Yang"), g("Mia Kwon")] },
  ] },
  blocks: [
    { day: 0, time: "17:00", min: 60, title: "Arrive + cabin assignments", owner: g("Hannah Choi") },
    { day: 0, time: "18:30", min: 60, title: "Dinner", owner: member.id },
    { day: 0, time: "20:00", min: 90, title: "Session 1 — Rooted in Christ", owner: g("Kevin Tran") },
    { day: 1, time: "08:00", min: 60, title: "Breakfast + quiet time", owner: null },
    { day: 1, time: "09:30", min: 90, title: "Session 2", owner: g("Kevin Tran") },
    { day: 1, time: "14:00", min: 180, title: "Free time / lake", owner: g("Joshua Nguyen") },
    { day: 1, time: "19:30", min: 120, title: "Campfire + testimonies", owner: g("Sarah Kim") },
    { day: 2, time: "09:00", min: 60, title: "Closing session + commissioning", owner: admin.id },
    { day: 2, time: "11:00", min: 60, title: "Pack up + depart", owner: g("Hannah Choi") },
  ],
})
await seedPlan(EV[turkey.title].id, turkey, {
  turnout: 50, budget: 120,
  type_data: { turkey: { commissioner: "Kevin Tran", teamA: { name: "Team Pitt", members: ["James Park", "Daniel Cho", "Nathan Song", "Caleb Ryu", "Ethan Yoo"] }, teamB: { name: "Team CMU", members: ["Joshua Nguyen", "David Chen", "Isaac Moon", "Elijah Seo", "Andrew Yun"] } } },
})
await seedPlan(EV[gan.title].id, gan, { turnout: 30, budget: 150, assignees: [g("Sarah Kim"), g("Hannah Choi"), g("Rachel Yang")] })

// Roles + transport for the pre-existing "Summer Retreat 2026" (it had a plan with no roles).
{
  const { data: sr } = await db.from("calendar_events").select("id").eq("ministry_id", mid).eq("title", "Summer Retreat 2026").maybeSingle()
  if (sr) {
    const { data: plan } = await db.from("event_plans").select("id,type_data").eq("calendar_event_id", sr.id).maybeSingle()
    const { count } = await db.from("event_roles").select("*", { count: "exact", head: true }).eq("event_plan_id", plan.id)
    if (plan && !count) {
      for (const [k, r] of EVENT_PRESET_DATA.retreat.defaultRoles.entries()) {
        const { data, error } = await db.from("event_roles").insert({ event_plan_id: plan.id, role_name: r.name, notes: r.notes ?? null, assigned_to: [admin.id, g("Sarah Kim"), member.id, null][k % 4], created_by: admin.id }).select("id").single()
        if (error) die("sr role", error); rec("event_roles", data)
      }
      await db.from("event_plans").update({ type_data: { ...(plan.type_data ?? {}), transport: [{ id: "c1", driver_id: admin.id, vehicle: "Grey Sienna", seats: 7, rider_ids: [member.id, g("Grace Lee")] }] } }).eq("id", plan.id)
    }
  }
}

// Outreach team calendar events (standard/calendar workspace).
for (const ev of [
  { title: "Pitt Involvement Fair — tabling", type: "ministry", category: "welcoming", date: D(4), start: "11:00", end: "15:00", location: "Bigelow Blvd", team_id: outreachId },
  { title: "CMU Activities Fair — tabling", type: "ministry", category: "welcoming", date: D(6), start: "12:00", end: "16:00", location: "The Cut", team_id: outreachId },
  { title: "Welcome Dinner for first-years", type: "social", category: "welcoming", date: D(12), start: "18:00", end: "20:00", location: "Fellowship Hall", team_id: outreachId },
  { title: "Sunday Service", type: "ministry", category: "service", date: D((7 - new Date(todayYMD + "T12:00:00Z").getUTCDay()) % 7 || 7), start: "10:30", end: "12:30", location: "Main Sanctuary", team_id: null, recurring: true },
]) { const r = await upsertEvent(ev); if (!r.existed && ev.team_id) await seedPlan(r.id, ev, { turnout: 20 }) }

// ── Event template (playbook) ────────────────────────────────────────────────
{
  const { data: ex } = await db.from("event_templates").select("id").eq("ministry_id", mid).eq("name", "Coffeehouse playbook").maybeSingle()
  if (!ex) {
    const { data: t, error } = await db.from("event_templates").insert({ ministry_id: mid, team_id: boardId, event_type: "coffeehouse", name: "Coffeehouse playbook", year_label: "Fall 2025", lineage_key: "coffeehouse", extra_notes: ["Sound check always runs long — start at 6:30, not 7."], stats: { turnout: 110, tasks: 23 }, created_by: admin.id }).select("id").single()
    if (error) die("template", error); rec("event_templates", t)
    let k = 0
    for (const phase of EVENT_PRESET_DATA.coffeehouse.defaultPhases) for (const task of phase.tasks) {
      const { data, error: e2 } = await db.from("template_tasks").insert({ template_id: t.id, title: task.title, phase: phase.key, offset_days: task.off ?? null, actual_offset_days: task.off != null ? task.off - 2 : null, sort_order: k++ }).select("id").single()
      if (e2) die("template task", e2); rec("template_tasks", data)
    }
    for (const [k2, r] of EVENT_PRESET_DATA.coffeehouse.defaultRoles.entries()) { const { data, error: e3 } = await db.from("template_roles").insert({ template_id: t.id, role_name: r.name, notes: r.notes ?? null, sort_order: k2 }).select("id").single(); if (e3) die("template role", e3); rec("template_roles", data) }
  }
}

// ── Images (announcement photo, home slide photo) ────────────────────────────
async function uploadPng(path, r, g2, b) {
  const buf = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r, g: g2, b } } })
    .composite([{ input: Buffer.from(`<svg width="1600" height="900"><circle cx="1200" cy="300" r="260" fill="rgba(255,255,255,0.18)"/><circle cx="400" cy="700" r="340" fill="rgba(0,0,0,0.12)"/></svg>`), blend: "over" }])
    .jpeg({ quality: 82 }).toBuffer()
  const { error } = await db.storage.from("announcement-images").upload(path, buf, { contentType: "image/jpeg", upsert: true })
  if (error) die(`upload ${path}`, error)
  return `${PUBLIC}/announcement-images/${path}`
}
const annImg = await uploadPng(`announcements/${mid}/design-pass-kickoff.jpg`, 62, 21, 64)
const slideImg = await uploadPng(`home-slides/${mid}/design-pass-retreat.jpg`, 91, 122, 108)

// ── Announcements ────────────────────────────────────────────────────────────
async function upsertAnnouncement(a) {
  const { data: ex } = await db.from("announcements").select("id").eq("ministry_id", mid).eq("title", a.title).maybeSingle()
  if (ex) return { id: ex.id, existed: true }
  const { data, error } = await db.from("announcements").insert({ ministry_id: mid, audience: "all", status: "published", created_by: admin.id, ...a }).select("id").single()
  if (error) die(`announcement ${a.title}`, error)
  return { id: rec("announcements", data).id, existed: false }
}
const ANN = {}
ANN.welcome = await upsertAnnouncement({ requires_ack: false, title: "Welcome back — here's how this semester works", body: "So glad you're here. Announcements land on this tab, events have RSVPs, and your small group chat is where the week actually happens. If you're new, say hi in the main chat — someone will find you a group by Friday.", is_pinned: true, created_at: new Date(Date.now() - 12 * 864e5).toISOString() })
ANN.kickoff = await upsertAnnouncement({ requires_ack: false, title: "Fall Kickoff Night — RSVP so we get enough dessert", body: "Our first big night of the semester. Worship, a short message from Pastor Kevin, and dessert after in the lounge. Room 232 in the Cathedral — look for the balloons. Bring a friend from your floor.", is_event: true, event_date: at(kickoff.date, "19:00"), event_end_date: at(kickoff.date, "21:30"), show_attendees: true, image_url: annImg, created_by: g("Sarah Kim"), created_at: new Date(Date.now() - 5 * 864e5).toISOString() })
ANN.retreat = await upsertAnnouncement({ requires_ack: false, title: "Fall Retreat sign-ups are open (deadline next Friday)", body: "Three days at Camp Harmony. $85 covers lodging, meals, and the bus — scholarships available, just ask. Fill out the form below so we can sort cabins and dietary needs.", is_event: true, event_date: at(retreat.date, "17:00"), event_end_date: at(ymdShift(retreat.date, 2), "12:00"), show_attendees: false, created_by: g("Hannah Choi"), created_at: new Date(Date.now() - 3 * 864e5).toISOString() })
ANN.policy = await upsertAnnouncement({ title: "Please read: new building access policy", body: "Starting Monday the side door locks at 9pm. If you're staying late for setup, text a board member and we'll let you in. Tap 'Got it' below so we know everyone has seen this.", requires_ack: true, created_at: new Date(Date.now() - 2 * 864e5).toISOString() })
ANN.seniors = await upsertAnnouncement({ requires_ack: false, title: "Seniors: grad photos after service on the 27th", body: "Wear something nice-ish. We'll do the group shot on the front steps first, then individual ones inside.", audience: "Class of 2026", created_by: g("James Park"), created_at: new Date(Date.now() - 1 * 864e5).toISOString() })
ANN.draft = await upsertAnnouncement({ requires_ack: false, title: "Small group placements — DRAFT", body: "Placements go out this Friday. Leaders will reach out individually.", status: "draft" })
{
  const rsvpers = [admin.id, member.id, ...["Grace Lee", "Daniel Cho", "Joshua Nguyen", "Rachel Yang", "Emily Wong", "David Chen", "Esther Han", "Nathan Song", "Lydia Kang", "Caleb Ryu", "Chloe Shin", "Isaac Moon"].map(g)]
  const { error } = await db.from("rsvps").upsert(rsvpers.map(user_id => ({ announcement_id: ANN.kickoff.id, user_id })), { onConflict: "announcement_id,user_id", ignoreDuplicates: true })
  if (error) die("rsvps", error)
  const { error: e2 } = await db.from("rsvps").upsert([admin.id, ...["Grace Lee", "Sarah Kim", "Hannah Choi", "Mia Kwon", "Olivia Paik"].map(g)].map(user_id => ({ announcement_id: ANN.retreat.id, user_id })), { onConflict: "announcement_id,user_id", ignoreDuplicates: true })
  if (e2) die("rsvps2", e2)
  const { error: e3 } = await db.from("announcement_acknowledgements").upsert([admin.id, ...["Sarah Kim", "James Park", "Hannah Choi", "Joshua Nguyen", "Rachel Yang", "David Chen", "Lydia Kang"].map(g)].map(user_id => ({ announcement_id: ANN.policy.id, user_id })), { onConflict: "announcement_id,user_id", ignoreDuplicates: true })
  if (e3) die("acks", e3)
  const views = []
  for (const a of Object.values(ANN)) for (const p of people.slice(0, 18)) views.push({ announcement_id: a.id, user_id: p.id })
  await db.from("announcement_views").upsert(views, { onConflict: "announcement_id,user_id", ignoreDuplicates: true })
}
// requires_ack defaults TRUE in the composer; only the policy notice should ask for it.
await db.from("announcements").update({ requires_ack: false }).eq("ministry_id", mid).neq("id", ANN.policy.id)
// Link the calendar events to their announcements (Up Next / hero).
await db.from("calendar_events").update({ linked_announcement_id: ANN.kickoff.id }).eq("id", EV[kickoff.title].id)
await db.from("calendar_events").update({ linked_announcement_id: ANN.retreat.id }).eq("id", EV[retreat.title].id)

// ── Forms ────────────────────────────────────────────────────────────────────
async function upsertForm(title, announcement_id, fields, responses, archived = false) {
  const { data: ex } = await db.from("announcement_forms").select("id").eq("ministry_id", mid).eq("title", title).maybeSingle()
  if (ex) return ex.id
  const { data: f, error } = await db.from("announcement_forms").insert({ ministry_id: mid, title, announcement_id, created_by: admin.id, archived }).select("id").single()
  if (error) die(`form ${title}`, error); rec("announcement_forms", f)
  const fieldIds = []
  for (const [k, fld] of fields.entries()) { const { data, error: e2 } = await db.from("form_fields").insert({ form_id: f.id, label: fld.label, type: fld.type, options: fld.options ?? [], required: !!fld.required, order_index: k }).select("id").single(); if (e2) die("field", e2); fieldIds.push(rec("form_fields", data).id) }
  for (const [uid, answers] of responses) {
    const { data: r, error: e3 } = await db.from("form_responses").insert({ form_id: f.id, announcement_id, ministry_id: mid, user_id: uid }).select("id").single()
    if (e3) die("response", e3); rec("form_responses", r)
    const { error: e4 } = await db.from("form_answers").insert(answers.map((v, k) => ({ response_id: r.id, field_id: fieldIds[k], value: Array.isArray(v) ? null : v, values: Array.isArray(v) ? v : [] })))
    if (e4) die("answers", e4)
  }
  return f.id
}
await upsertForm("Fall Retreat sign-up", ANN.retreat.id, [
  { label: "Full name", type: "text", required: true },
  { label: "T-shirt size", type: "dropdown", options: ["S", "M", "L", "XL"], required: true },
  { label: "Dietary needs", type: "checkbox", options: ["Vegetarian", "Gluten-free", "Nut allergy", "None"] },
  { label: "Anything we should know?", type: "text" },
], [
  [member.id, ["E2E Member", "M", ["Gluten-free"], "First retreat!"]],
  [admin.id, ["E2E Admin", "L", ["None"], "I can drive."]],
])
await upsertForm("Leader feedback — kickoff", null, [
  { label: "What went well?", type: "text" },
  { label: "Rate the setup", type: "multiple_choice", options: ["1", "2", "3", "4", "5"] },
], [])
await upsertForm("Spring retreat interest (archived)", null, [{ label: "Interested?", type: "dropdown", options: ["Yes", "Maybe", "No"] }], [], true)

// ── Chats ────────────────────────────────────────────────────────────────────
async function findOrCreateGroup(name, type, memberIds, extra = {}) {
  let { data: grp } = await db.from("groups").select("id").eq("ministry_id", mid).eq("name", name).maybeSingle()
  if (!grp) {
    const { data, error } = await db.from("groups").insert({ ministry_id: mid, name, type, created_by: admin.id, ...extra }).select("id").single()
    if (error) die(`group ${name}`, error); grp = rec("groups", data)
    const { error: e2 } = await db.from("group_members").upsert(memberIds.map(user_id => ({ group_id: grp.id, user_id })), { onConflict: "group_id,user_id", ignoreDuplicates: true })
    if (e2) die(`group members ${name}`, e2)
  }
  return grp.id
}
async function seedMessages(groupId, msgs, opts = {}) {
  const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("content", msgs[0][1])
  if (count) return []
  const base = Date.now() - msgs.length * 7 * 60_000
  const ids = []
  for (let i = 0; i < msgs.length; i++) {
    const [sender, content, extra] = msgs[i]
    const { data, error } = await db.from("messages").insert({ group_id: groupId, sender_id: sender, content, created_at: new Date(base + i * 7 * 60_000).toISOString(), reply_to_id: extra?.replyTo != null ? ids[extra.replyTo] : null, ...(extra?.row ?? {}) }).select("id").single()
    if (error) die("message", error); ids.push(rec("messages", data).id)
    if (extra?.reactions) { const { error: e2 } = await db.from("message_reactions").insert(extra.reactions.map(([uid, emoji]) => ({ message_id: data.id, user_id: uid, emoji, group_id: groupId }))); if (e2) die("reaction", e2) }
  }
  return ids
}
const centralIds = await seedMessages(central.id, [
  [admin.id, "Welcome back everyone! Kickoff is next Friday — RSVP on the announcement so we order enough dessert 🍰", { reactions: [[g("Grace Lee"), "🎉"], [g("Daniel Cho"), "🎉"], [g("Emily Wong"), "❤️"], [member.id, "🎉"]] }],
  [g("Grace Lee"), "so excited!! is it the same room as last year?"],
  [admin.id, "Same building, different room — 232 this time. There'll be balloons.", { replyTo: 1 }],
  [g("Joshua Nguyen"), "Can someone bring an HDMI adapter? The projector in 232 doesn't do USB-C"],
  [g("James Park"), "I got you", { replyTo: 3, reactions: [[g("Joshua Nguyen"), "🙏"]] }],
  [g("Sarah Kim"), "Small group placements go out Friday. If you haven't filled out the interest form yet please do it today 🙏"],
  [g("Emily Wong"), "done ✅"],
  [g("Esther Han"), "done!"],
  [g("Nathan Song"), "I can drive to the pumpkin patch btw, I have 4 seats"],
  [g("Hannah Choi"), "adding you to the transport list, thank you!!", { replyTo: 8, reactions: [[g("Nathan Song"), "👍"]] }],
  [g("Kevin Tran"), "Quick reminder that the side door locks at 9 now — text a board member if you're staying late for setup."],
  [g("Rachel Yang"), "wait since when"],
  [g("Kevin Tran"), "Since Monday — there's an announcement, tap Got it on it so we know you saw", { replyTo: 11 }],
  [g("David Chen"), "does anyone have the retreat packing list from last year"],
  [g("Lydia Kang"), "it's in the retreat announcement from last fall, I'll forward it"],
  [g("Chloe Shin"), "first year here 👋 where do I go Friday?"],
  [g("Sarah Kim"), "Welcome Chloe!! Cathedral of Learning room 232, 7pm. Come find me at the welcome table 😊", { replyTo: 15, reactions: [[g("Chloe Shin"), "❤️"], [g("Grace Lee"), "❤️"], [g("Anna Hwang"), "👋"]] }],
  [g("Isaac Moon"), "turkey bowl teams when"],
  [g("Kevin Tran"), "November. Patience.", { replyTo: 17, reactions: [[g("Isaac Moon"), "😂"], [g("Caleb Ryu"), "😂"], [g("Ethan Yoo"), "😂"]] }],
  [g("Mia Kwon"), "is there a form for the retreat or do we just rsvp"],
  [g("Hannah Choi"), "There's a form on the announcement — it asks shirt size + dietary stuff so please fill that instead of just RSVPing", { replyTo: 19 }],
  [g("Peter Kwak"), "Filled it out. Also I edited my shirt size, hope that's ok", { row: { is_edited: true, edited_at: new Date().toISOString() } }],
  [g("Olivia Paik"), "This message was removed", { row: { deleted: true } }],
  [admin.id, "Poll time — what should dessert be at kickoff?"],
  [g("Andrew Yun"), "cheesecake or riot"],
  [member.id, "See everyone Friday 🙌", { reactions: [[admin.id, "🙌"], [g("Sarah Kim"), "🙌"]] }],
])
if (centralIds.length) {
  const { data: poll, error } = await db.from("polls").insert({ group_id: central.id, question: "Dessert at kickoff?", options: ["Cheesecake", "Ice cream bar", "Boba", "Cookies + milk"], created_by: admin.id }).select("id").single()
  if (error) die("poll", error); rec("polls", poll)
  await db.from("messages").update({ poll_id: poll.id, message_type: "poll" }).eq("id", centralIds[22])
  const votes = people.slice(2, 22).map((p, i) => ({ poll_id: poll.id, user_id: p.id, option_index: [0, 0, 1, 2, 0, 3, 1, 0, 2, 2][i % 10] }))
  const { error: e2 } = await db.from("poll_votes").upsert(votes, { onConflict: "poll_id,user_id", ignoreDuplicates: true }); if (e2) die("votes", e2)
  await db.from("groups").update({ pinned_message_id: centralIds[0] }).eq("id", central.id)
}

const dgChat = await findOrCreateGroup("Tuesday Night DG", "my", [admin.id, member.id, g("Grace Lee"), g("Daniel Cho"), g("Emily Wong"), g("Esther Han")], { category: "group" })
await seedMessages(dgChat, [
  [admin.id, "Reminder: we're at Grace's place tonight, 7:30. Bring a snack if you can."],
  [g("Grace Lee"), "door code is 4471#"],
  [g("Daniel Cho"), "running 10 late, start without me"],
  [g("Emily Wong"), "same 😅"],
  [member.id, "I'm bringing the good cookies", { reactions: [[g("Grace Lee"), "🍪"], [admin.id, "🍪"]] }],
  [g("Esther Han"), "Can we do Romans 8 tonight? I have questions", { replyTo: 0 }],
  [admin.id, "Yes — that's the plan. Read through v.28 if you get a sec.", { replyTo: 5 }],
  [g("Grace Lee"), "", { row: { attachment_url: annImg, attachment_type: "image", attachment_name: "snacks.jpg", attachment_size: 184000 } }],
  [g("Daniel Cho"), "ok that's a lot of snacks"],
])
{
  const { data: ex } = await db.from("chat_nicknames").select("id").eq("group_id", dgChat).eq("target_user_id", member.id).maybeSingle()
  if (!ex) { const { data, error } = await db.from("chat_nicknames").insert({ group_id: dgChat, target_user_id: member.id, ministry_id: mid, nickname: "Cookie Captain", set_by: admin.id }).select("id").single(); if (error) die("nickname", error); rec("chat_nicknames", data) }
}
const dm = await findOrCreateGroup("E2E Member", "dm", [admin.id, member.id], { dm_key: [admin.id, member.id].sort().join(":"), name_is_generated: true })
await seedMessages(dm, [
  [member.id, "hey — do we have budget left for kickoff dessert?"],
  [admin.id, "About $200 from the church fund. Keep the receipt and submit it in Finance."],
  [member.id, "will do 🫡"],
  [admin.id, "Also can you own the dessert block on the run of show? 8:15 to 9:15"],
  [member.id, "yep, assign me", { reactions: [[admin.id, "🙏"]] }],
])
const leaders = await findOrCreateGroup("Leaders", "church", [admin.id, g("Sarah Kim"), g("James Park"), g("Hannah Choi"), g("Kevin Tran")], { category: "general" })
await seedMessages(leaders, [
  [admin.id, "Board sync moved to Thursday 8pm this week — meeting note is up."],
  [g("Hannah Choi"), "Retreat deposit is due to Camp Harmony by the 20th. James can you check the fund balance?"],
  [g("James Park"), "On it. We have enough in Pitt SORC if church fund is short.", { replyTo: 1 }],
  [g("Kevin Tran"), "Let's not touch SORC for the deposit — keep it for the bus."],
])
await findOrCreateGroup("Student Org Board", "church", [admin.id, member.id, g("Sarah Kim"), g("James Park"), g("Hannah Choi"), g("Joshua Nguyen")], { category: "team", linked_team_id: boardId })
await findOrCreateGroup("Spring Retreat 2026 planning", "my", [admin.id, g("Hannah Choi"), g("Sarah Kim")], { archived: true })
const pickup = await findOrCreateGroup("Pickup soccer (Sundays)", "my", [g("Isaac Moon"), g("Caleb Ryu"), g("Ethan Yoo"), g("Elijah Seo")], { is_open: true, category: "group" })
await seedMessages(pickup, [[g("Isaac Moon"), "Schenley Oval, 3pm, every Sunday. Newcomers welcome."], [g("Caleb Ryu"), "bringing the good ball this week"]])

// ── Small Group Leaders: roster, availability, rotation, groups, bible study ─
const dgls = [admin.id, member.id, g("Sarah Kim"), g("James Park"), g("Hannah Choi"), g("David Chen"), g("Lydia Kang"), g("Samuel Jung")]
{
  const { count } = await db.from("dgl_roster").select("*", { count: "exact", head: true }).eq("team_id", dglId).eq("semester", SEMESTER)
  if (!count) {
    const { error } = await db.from("dgl_roster").insert(dgls.map(user_id => ({ team_id: dglId, ministry_id: mid, user_id, semester: SEMESTER, confirmed_at: new Date().toISOString(), added_by: admin.id, schedule_ready: true })))
    if (error) die("dgl roster", error)
    const { data: st, error: e2 } = await db.from("dgl_roster_status").insert({ team_id: dglId, ministry_id: mid, semester: SEMESTER, confirmed: true, confirmed_at: new Date().toISOString(), confirmed_by: admin.id }).select("id").single()
    if (e2) die("roster status", e2); rec("dgl_roster_status", st)
    // Six weeks of Fridays from this week; availability + published assignments.
    const dow = new Date(todayYMD + "T12:00:00Z").getUTCDay()
    const firstFriday = ymdShift(todayYMD, (5 - dow + 7) % 7)
    const avail = [], assigns = []
    for (let w = 0; w < 6; w++) {
      const fri = ymdShift(firstFriday, 7 * w), wed = ymdShift(fri, -2), sun = ymdShift(fri, 2)
      for (const [k, uid] of dgls.entries()) {
        for (const [slot, date] of [["wednesday", wed], ["friday", fri], ["sunday", sun]]) avail.push({ user_id: uid, team_id: dglId, week_date: date, slot, is_busy: (k + w) % 5 === 0, semester: SEMESTER })
      }
      assigns.push({ team_id: dglId, ministry_id: mid, user_id: dgls[w % dgls.length], week_date: sun, slot: "sunday_service", semester: SEMESTER, published: true })
      assigns.push({ team_id: dglId, ministry_id: mid, user_id: dgls[(w + 3) % dgls.length], week_date: wed, slot: "wednesday_pm", semester: SEMESTER, published: true })
      assigns.push({ team_id: dglId, ministry_id: mid, user_id: dgls[(w + 5) % dgls.length], week_date: fri, slot: "friday_sg", semester: SEMESTER, published: true })
    }
    const { error: e3 } = await db.from("dgl_availability").insert(avail); if (e3) die("availability", e3)
    const { error: e4 } = await db.from("dgl_assignments").insert(assigns); if (e4) die("assignments", e4)
  }
  const { count: sgCount } = await db.from("small_groups").select("*", { count: "exact", head: true }).eq("team_id", dglId)
  if (!sgCount) {
    const groups = [
      ["Brothers — Oakland", "brothers", admin.id, [g("Daniel Cho"), g("Joshua Nguyen"), g("Nathan Song"), g("Caleb Ryu")]],
      ["Sisters — Oakland", "sisters", g("Sarah Kim"), [g("Grace Lee"), g("Emily Wong"), g("Esther Han"), g("Chloe Shin")]],
      ["Brothers — Shadyside", "brothers", g("James Park"), [g("David Chen"), g("Isaac Moon"), g("Elijah Seo"), g("Andrew Yun")]],
      ["Sisters — Shadyside", "sisters", g("Hannah Choi"), [g("Rachel Yang"), g("Lydia Kang"), g("Mia Kwon"), member.id]],
    ]
    const ids = []
    for (const [name, type, leader_id, members] of groups) {
      const { data, error } = await db.from("small_groups").insert({ team_id: dglId, ministry_id: mid, name, type, leader_id, chat_group_id: name.startsWith("Brothers — Oakland") ? dgChat : null }).select("id").single()
      if (error) die(`sg ${name}`, error); ids.push(rec("small_groups", data).id)
      const { error: e2 } = await db.from("small_group_members").insert(members.map(user_id => ({ group_id: data.id, user_id, meal_taken: Math.random() > 0.5, meal_semester: SEMESTER }))); if (e2) die("sg members", e2)
    }
    await db.from("small_groups").update({ paired_group_id: ids[1] }).eq("id", ids[0]); await db.from("small_groups").update({ paired_group_id: ids[0] }).eq("id", ids[1])
    await db.from("small_groups").update({ paired_group_id: ids[3] }).eq("id", ids[2]); await db.from("small_groups").update({ paired_group_id: ids[2] }).eq("id", ids[3])
  }
  const { count: bsCount } = await db.from("bible_study_sheets").select("*", { count: "exact", head: true }).eq("team_id", dglId)
  if (!bsCount) {
    for (const [k, [title, status, weeksAgo, notes]] of [
      ["Week 1 — Romans 8: No condemnation", "finalized", 2, "Slow down on v.1 — most of them have never actually heard it applied to themselves."],
      ["Week 2 — Romans 8: Led by the Spirit", "finalized", 1, "Ask what 'led' looks like on a Tuesday. Don't let it stay abstract."],
      ["Week 3 — Romans 8: Groaning and hope", "draft", 0, null],
    ].entries()) {
      const { data, error } = await db.from("bible_study_sheets").insert({ team_id: dglId, ministry_id: mid, title, status, week_date: ymdShift(todayYMD, -7 * weeksAgo), semester: SEMESTER, google_doc_url: "https://docs.google.com/document/d/1example", pastor_notes: notes, finalized_at: status === "finalized" ? new Date().toISOString() : null, finalized_by: status === "finalized" ? admin.id : null, created_by: admin.id, sort_order: k }).select("id").single()
      if (error) die("bible sheet", error); rec("bible_study_sheets", data)
      if (status === "finalized") { await db.from("bible_study_progress").insert([{ sheet_id: data.id, user_id: member.id, read_at: new Date().toISOString(), progress_note: "Went well — group asked about v.26." }, { sheet_id: data.id, user_id: g("Sarah Kim"), read_at: new Date().toISOString() }]) }
    }
  }
}

// ── Board: meeting notes + rotations ─────────────────────────────────────────
{
  const { count } = await db.from("meeting_notes").select("*", { count: "exact", head: true }).eq("team_id", boardId)
  if (!count) {
    const NOTES = [
      { n: 1, d: -21, title: "Semester kickoff planning", body: "<p>First board sync. Locked the big rocks for fall.</p><ul><li>Kickoff Night in 232 — Sarah owns worship, Joshua owns setup.</li><li>Retreat deposit due the 20th.</li><li>Coffeehouse moves to November.</li></ul>", agenda: ["Kickoff room + AV", "Retreat deposit", "Coffeehouse date"], decisions: ["Kickoff stays in the Cathedral", "Coffeehouse → Nov 6"], linked: EV[kickoff.title].id },
      { n: 2, d: -10, title: "Retreat + transport", body: "<p>Cabins, bus vs carpool, scholarship fund.</p><ul><li>Carpool for the first 30, bus if we cross 50.</li><li>Scholarships capped at $40 each from church fund.</li></ul>", agenda: ["Bus or carpools?", "Scholarships", "Speaker confirmation"], decisions: ["Carpool first, bus at 50+", "Scholarship cap $40"], linked: EV[retreat.title].id },
      { n: 3, d: -2, title: "Weekly board sync", body: "<p>Quick check-in ahead of kickoff.</p><ul><li>RSVPs at 14 — push in the chat again Thursday.</li><li>Dessert order goes in Wednesday (member).</li></ul>", agenda: ["RSVP count", "Dessert", "Greeter team"], decisions: ["Push RSVP reminder Thursday"], linked: EV[kickoff.title].id },
    ]
    for (const x of NOTES) {
      const { data, error } = await db.from("meeting_notes").insert({ team_id: boardId, note_number: x.n, date: ymdShift(todayYMD, x.d), title: x.title, body: x.body, created_by: admin.id, linked_event_id: x.linked, attendees: [admin.id, g("Sarah Kim"), g("James Park"), g("Hannah Choi")] }).select("id").single()
      if (error) die("meeting note", error); rec("meeting_notes", data)
      const { error: e2 } = await db.from("meeting_note_agenda_items").insert(x.agenda.map((text, k) => ({ note_id: data.id, text, done: k === 0, sort_order: k, created_by: admin.id }))); if (e2) die("agenda", e2)
      const { error: e3 } = await db.from("meeting_note_decisions").insert(x.decisions.map((text, k) => ({ note_id: data.id, text, sort_order: k, created_by: admin.id }))); if (e3) die("decisions", e3)
    }
  }
  const { count: semCount } = await db.from("rotation_semesters").select("*", { count: "exact", head: true }).eq("team_id", boardId)
  if (!semCount) {
    const label = SEMESTER.replace("_", " ").replace(/^\w/, c => c.toUpperCase())
    const { data: sem, error } = await db.from("rotation_semesters").insert({ ministry_id: mid, team_id: boardId, name: label, start_date: todayYMD, end_date: ymdShift(todayYMD, 7 * 10), created_by: admin.id }).select("id").single()
    if (error) die("semester", error); rec("rotation_semesters", sem)
    const dow = new Date(todayYMD + "T12:00:00Z").getUTCDay()
    const sunday = ymdShift(todayYMD, (7 - dow) % 7 || 7), friday = ymdShift(todayYMD, (5 - dow + 7) % 7)
    const rows = []
    for (let w = 0; w < 10; w++) {
      rows.push({ ministry_id: mid, team_id: boardId, semester_id: sem.id, rotation_type: "sunday_lunch_prayer", week_date: ymdShift(sunday, 7 * w), assigned_to: w < 5 ? [admin.id, g("Sarah Kim"), g("James Park"), member.id, g("Hannah Choi")][w] : null })
      rows.push({ ministry_id: mid, team_id: boardId, semester_id: sem.id, rotation_type: "lockup", week_date: ymdShift(friday, 7 * w), assigned_to: w < 3 ? [g("Joshua Nguyen"), admin.id, g("Kevin Tran")][w] : null })
    }
    const { error: e2 } = await db.from("ccsf_rotations").insert(rows); if (e2) die("rotations", e2)
  }
  const { count: linkCount } = await db.from("team_role_links").select("*", { count: "exact", head: true }).eq("team_id", boardId)
  if (!linkCount) {
    const { error } = await db.from("team_role_links").insert([
      { team_id: boardId, role_name: "President", title: "Board handbook", description: "Everything the last three presidents wished they'd known.", url: "https://docs.google.com/document/d/handbook", created_by: admin.id },
      { team_id: boardId, role_name: "Treasurer", title: "Reimbursement policy", description: "Caps, funds, and what needs a sign-off.", url: "https://docs.google.com/document/d/reimb", created_by: admin.id },
      { team_id: boardId, role_name: "Event Coordinator", title: "Room booking portal", description: "Book Cathedral and Union rooms — needs the org login.", url: "https://pitt.edu/rooms", created_by: admin.id },
    ]); if (error) die("role links", error)
  }
  const { count: trCount } = await db.from("transition_notes").select("*", { count: "exact", head: true }).eq("ministry_id", mid)
  if (!trCount) {
    const { error } = await db.from("transition_notes").insert([
      { ministry_id: mid, team_id: boardId, event_type: "coffeehouse", class_year: "2026", title: "Sound check runs long", category: "watch", watch_text: "Start at 6:30 — every year we start at 7 and open late.", created_by: admin.id, created_by_name: "E2E Admin" },
      { ministry_id: mid, team_id: boardId, event_type: "retreat", class_year: "2026", title: "Bus vs carpool", category: "solved", solved_text: "Carpool under 50 people; bus quote is only worth it past that.", created_by: admin.id, created_by_name: "E2E Admin" },
    ]); if (error) die("transition notes", error)
  }
}

// ── Board: a saved group set (Groups section drill) ─────────────────────────
{
  const { count } = await db.from("group_sessions").select("*", { count: "exact", head: true }).eq("team_id", boardId)
  if (!count) {
    const { data: session, error } = await db.from("group_sessions").insert({ team_id: boardId, ministry_id: mid, name: "Fall Small Groups", source_type: "roster", config: { numGroups: 4, balanceByYear: true, separateVisitors: true, smallGroupMode: false, naming: "custom" }, created_by: admin.id }).select("id").single()
    if (error) die("group session", error); rec("group_sessions", session)
    const GROUPS = [["Group 1", [admin.id, g("Grace Lee"), g("Daniel Cho"), g("Emily Wong"), g("Micah Lim")]], ["Group 2", [g("Sarah Kim"), g("James Park"), g("Esther Han"), g("Nathan Song"), g("Abigail Oh")]], ["Group 3", [g("Hannah Choi"), g("Joshua Nguyen"), g("Rachel Yang"), g("Lydia Kang"), g("Jacob Im")]], ["Group 4", [member.id, g("David Chen"), g("Caleb Ryu"), g("Chloe Shin"), g("Isaac Moon")]]]
    for (const [i, [name, members]] of GROUPS.entries()) {
      const { data: gg, error: e2 } = await db.from("generated_groups").insert({ session_id: session.id, name, order_index: i }).select("id").single()
      if (e2) die("generated group", e2); rec("generated_groups", gg)
      const { error: e3 } = await db.from("generated_group_members").insert(members.map(user_id => ({ group_id: gg.id, user_id }))); if (e3) die("gg members", e3)
    }
  }
}

// ── Finance ──────────────────────────────────────────────────────────────────
const CATS = ["DG Dinner", "Events", "Retreat", "Supplies", "Outreach", "Worship"]
{
  const { data: ex } = await db.from("budget_categories").select("name").eq("ministry_id", mid)
  const have = new Set(ex.map(c => c.name))
  const rows = CATS.filter(c => !have.has(c)).map(name => ({ ministry_id: mid, name, created_by: admin.id }))
  if (rows.length) { const { error } = await db.from("budget_categories").insert(rows); if (error) die("categories", error) }
  const { count } = await db.from("ministry_budgets").select("*", { count: "exact", head: true }).eq("ministry_id", mid).eq("fiscal_year", FISCAL_YEAR)
  if (!count) {
    const alloc = []
    for (const [cat, church, pitt, cmu] of [["DG Dinner", 1200, 0, 0], ["Events", 1500, 800, 400], ["Retreat", 2500, 1500, 0], ["Supplies", 400, 200, 100], ["Outreach", 600, 300, 300], ["Worship", 500, 0, 0]]) {
      for (const [fund, amt] of [["church", church], ["pitt", pitt], ["cmu", cmu]]) if (amt) alloc.push({ ministry_id: mid, fiscal_year: FISCAL_YEAR, category: cat, fund, fund_id: funds[fund], allocated_amount: amt, created_by: admin.id, updated_by: admin.id })
    }
    const { error } = await db.from("ministry_budgets").insert(alloc); if (error) die("allocations", error)
  }
  const { count: entries } = await db.from("budget_entries").select("*", { count: "exact", head: true }).eq("ministry_id", mid)
  if (!entries) {
    const { error } = await db.from("budget_entries").insert([
      ["Events", "church", 84.5, "Kickoff balloons + signage", -6], ["DG Dinner", "church", 62.13, "Tuesday DG groceries", -8], ["Supplies", "pitt", 45, "Tabling banner reprint", -12],
      ["Outreach", "cmu", 120, "Activities fair booth fee", -14], ["Retreat", "church", 500, "Camp Harmony deposit", -20], ["Worship", "church", 39.99, "Cable + capo", -25],
      ["Events", "pitt", 210, "Spring formal venue balance", -60], ["DG Dinner", "church", 58.4, "Thursday DG groceries", -30], ["Supplies", "church", 22.75, "Name tags", -1],
    ].map(([category, fund, amount, description, d]) => ({ ministry_id: mid, entry_date: ymdShift(todayYMD, d), category, fund, amount, description, source: "manual", created_by: admin.id })))
    if (error) die("entries", error)
  }
  const { count: rl } = await db.from("receipt_limits").select("*", { count: "exact", head: true }).eq("ministry_id", mid)
  if (!rl) { const { error } = await db.from("receipt_limits").insert([{ ministry_id: mid, category: "DG Dinner", fund: "church", fund_id: funds.church, max_amount: 75 }, { ministry_id: mid, category: "Events", fund: "pitt", fund_id: funds.pitt, max_amount: 250 }]); if (error) die("limits", error) }
  // Receipt categories per team (Receipts workspace strips).
  for (const [teamId, list] of [[boardId, [["Events", "church"], ["Retreat", "church"], ["Supplies", "pitt"]]], [dglId, [["DG Dinner", "church"]]], [outreachId, [["Outreach", "cmu"], ["Supplies", "pitt"]]]]) {
    const { data: ex2 } = await db.from("receipt_categories").select("name").eq("team_id", teamId)
    const have2 = new Set(ex2.map(c => c.name))
    for (const [k, [name, fund]] of list.entries()) { if (have2.has(name)) continue; const { data, error } = await db.from("receipt_categories").insert({ ministry_id: mid, team_id: teamId, name, fund, fund_id: funds[fund], order_index: k, created_by: admin.id }).select("id").single(); if (error) die("receipt category", error); rec("receipt_categories", data) }
  }
  {
    const { data: cats } = await db.from("receipt_categories").select("id,name,team_id")
    const catId = (teamId, name) => cats.find(c => c.team_id === teamId && c.name === name)?.id ?? null
    const R = [
      { by: member, name: "Kickoff dessert — Costco", cat: "Events", team: boardId, fund: "church", amount: 96.4, d: -1, status: "pending", splits: [["church", 96.4, "pending"]] },
      { by: byName["Sarah Kim"], name: "Tuesday DG groceries", cat: "DG Dinner", team: dglId, fund: "church", amount: 61.2, d: -3, status: "approved", splits: [["church", 61.2, "approved"]] },
      { by: byName["Hannah Choi"], name: "Retreat — camp deposit", cat: "Retreat", team: boardId, fund: "church", amount: 500, d: -19, status: "reimbursed", splits: [["church", 500, "reimbursed"]] },
      { by: byName["Rachel Yang"], name: "Tabling banner", cat: "Supplies", team: outreachId, fund: "pitt", amount: 45, d: -11, status: "requested", splits: [["pitt", 45, "requested"]] },
      { by: byName["Joshua Nguyen"], name: "HDMI adapters ×3", cat: "Supplies", team: boardId, fund: "pitt", amount: 38.97, d: -4, status: "rejected", reason: "Duplicate of the adapters bought in March — check the supply bin.", splits: [["pitt", 38.97, "declined"]] },
      { by: byName["James Park"], name: "Coffeehouse — cups, lids, sleeves", cat: "Events", team: boardId, fund: "church", amount: 212.3, d: -2, status: "pending", splits: [["church", 120, "pending"], ["cmu", 92.3, "pending"]] },
      { by: byName["Nathan Song"], name: "Activities fair booth", cat: "Outreach", team: outreachId, fund: "cmu", amount: 120, d: -13, status: "partial", splits: [["cmu", 80, "reimbursed"], ["church", 40, "declined"]] },
      { by: admin, name: "Kickoff signage + balloons", cat: "Events", team: boardId, fund: "church", amount: 84.5, d: -6, status: "reimbursed", splits: [["church", 84.5, "reimbursed"]] },
      { by: admin, name: "Retreat — speaker gift", cat: "Retreat", team: boardId, fund: "church", amount: 40, d: -2, status: "pending", splits: [["church", 40, "pending"]] },
      { by: byName["Lydia Kang"], name: "Thursday DG groceries", cat: "DG Dinner", team: dglId, fund: "church", amount: 58.4, d: -29, status: "reimbursed", splits: [["church", 58.4, "reimbursed"]] },
    ]
    for (const r of R) {
      const { data: exr } = await db.from("receipts").select("id").eq("ministry_id", mid).eq("event_name", r.name).maybeSingle()
      if (exr) continue
      const { data, error } = await db.from("receipts").insert({ ministry_id: mid, submitted_by: r.by.id, submitted_by_name: r.by.name, event_name: r.name, category: r.cat, category_id: catId(r.team, r.cat), team_id: r.team, fund: r.fund, amount: r.amount, purchase_date: ymdShift(todayYMD, r.d), submitted_at: new Date(Date.now() + r.d * 864e5 + 36e5).toISOString(), status: r.status, receipt_image_url: annImg, receipt_image_urls: [annImg], notes: r.status === "pending" ? "Split with CMU per Hannah" : null, decision_reason: r.reason ?? null, reviewed_by: r.status === "pending" ? null : admin.id, reviewed_at: r.status === "pending" ? null : new Date().toISOString() }).select("id").single()
      if (error) die(`receipt ${r.name}`, error); rec("receipts", data)
      for (const [fund, amount, status] of r.splits) {
        const { data: a, error: e2 } = await db.from("receipt_fund_allocations").insert({ receipt_id: data.id, ministry_id: mid, fund_id: funds[fund], amount, status, requested_at: status === "requested" ? new Date().toISOString() : null, reviewed_by: status === "pending" ? null : admin.id, reviewed_at: status === "pending" ? null : new Date().toISOString(), signed_off_by: status === "reimbursed" ? admin.id : null, signed_off_at: status === "reimbursed" ? new Date().toISOString() : null, decision_reason: status === "declined" ? (r.reason ?? "Not covered by this fund") : null }).select("id").single()
        if (e2) die("allocation", e2); rec("receipt_fund_allocations", a)
        if (status === "reimbursed") { const { error: e3 } = await db.from("budget_entries").insert({ ministry_id: mid, entry_date: ymdShift(todayYMD, r.d), category: r.cat, fund, amount, description: r.name, source: "receipt", receipt_allocation_id: a.id, created_by: admin.id }); if (e3) die("posted entry", e3) }
      }
    }
  }
}

// ── Home slides ──────────────────────────────────────────────────────────────
{
  const { count } = await db.from("home_slides").select("*", { count: "exact", head: true }).eq("ministry_id", mid)
  if (!count) {
    const { error } = await db.from("home_slides").insert([
      { ministry_id: mid, slide_type: "event", calendar_event_id: EV[retreat.title].id, image_url: slideImg, caption: "Three days away. Theme: Rooted.", eyebrow: "Fall Retreat", panel_color: "#3b4a3c", order_index: 0, is_active: true, created_by: admin.id },
      { ministry_id: mid, slide_type: "announcement", announcement_id: ANN.kickoff.id, order_index: 1, is_active: true, created_by: admin.id },
      { ministry_id: mid, slide_type: "event", calendar_event_id: EV[coffeehouse.title].id, order_index: 2, is_active: true, created_by: admin.id },
    ]); if (error) die("slides", error)
  }
}

// ── Congregation (pastor) ────────────────────────────────────────────────────
{
  {
    const Q = [
      { question_text: "How connected do you feel to the community right now?", question_type: "scale", options: null, is_active: true, resp: people.slice(2, 20).map((p, i) => ({ user_id: p.id, response_scale: [3, 4, 5, 2, 4, 4, 5, 3][i % 8] })) },
      { question_text: "Which night works best for a mid-week prayer meeting?", question_type: "poll", options: ["Tuesday", "Wednesday", "Thursday"], is_active: false, closed_at: new Date(Date.now() - 5 * 864e5).toISOString(), resp: people.slice(2, 18).map((p, i) => ({ user_id: p.id, response_option: ["Wednesday", "Tuesday", "Wednesday", "Thursday"][i % 4] })) },
      { question_text: "What's one thing you'd like prayer for this month?", question_type: "open", options: null, is_active: false, closed_at: new Date(Date.now() - 20 * 864e5).toISOString(), resp: people.slice(2, 10).map((p, i) => ({ user_id: p.id, response_text: ["Midterms and sleep", "My roommate situation", "Deciding on a major", "Family back home", "Direction after graduation", "Friendships that go deeper", "Consistency in quiet time", "Courage to invite people"][i] })) },
    ]
    for (const q of Q) {
      const { resp, ...row } = q
      const { data: exq } = await db.from("congregation_questions").select("id").eq("ministry_id", mid).eq("question_text", row.question_text).maybeSingle()
      if (exq) continue
      const { data, error } = await db.from("congregation_questions").insert({ ministry_id: mid, created_by: admin.id, ...row }).select("id").single()
      if (error) die("question", error); rec("congregation_questions", data)
      const { error: e2 } = await db.from("congregation_responses").insert(resp.map(r => ({ question_id: data.id, ministry_id: mid, ...r }))); if (e2) die("responses", e2)
    }
  }
}

// ── Journal (admin's own) ────────────────────────────────────────────────────
{
  const { count } = await db.from("devotionals").select("*", { count: "exact", head: true }).eq("user_id", admin.id)
  if (!count) {
    await db.from("devotionals").insert([
      { user_id: admin.id, ministry_id: mid, title: "New every morning", passage: "Lamentations 3:22-23", content: "Read this again after a rough board meeting. The mercies are new — not stored up from yesterday's good behavior.", created_at: new Date(Date.now() - 1 * 864e5).toISOString() },
      { user_id: admin.id, ministry_id: mid, title: "Rooted", passage: "Colossians 2:6-7", content: "Retreat theme prep. What does it mean to be rooted when every semester uproots you?", created_at: new Date(Date.now() - 4 * 864e5).toISOString() },
      { user_id: admin.id, ministry_id: mid, title: "Do not be anxious", passage: "Philippians 4:6-7", content: "Kickoff RSVPs are low and I'm anxious. Prayer and petition, with thanksgiving.", created_at: new Date(Date.now() - 9 * 864e5).toISOString() },
    ])
    await db.from("prayers").insert([
      { user_id: admin.id, ministry_id: mid, title: "Chloe (first-year)", content: "That she finds a group fast and it sticks.", status: "praying" },
      { user_id: admin.id, ministry_id: mid, title: "Retreat speaker", content: "Kevin confirmed — thank you.", status: "answered" },
      { user_id: admin.id, ministry_id: mid, title: "Board unity", content: "Less logistics, more actual friendship.", status: "ongoing" },
    ])
    await db.from("verses").insert([
      { user_id: admin.id, ministry_id: mid, reference: "Isaiah 41:10", verse_text: "Fear not, for I am with you; be not dismayed, for I am your God.", note: "Kickoff week." },
      { user_id: admin.id, ministry_id: mid, reference: "Psalm 127:1", verse_text: "Unless the LORD builds the house, those who build it labor in vain.", note: "Planning season." },
    ])
  }
}

// ── Settings: reports, audit log, ban, departure ─────────────────────────────
{
  const { count } = await db.from("content_reports").select("*", { count: "exact", head: true }).eq("ministry_id", mid)
  if (!count) {
    if (!centralIds.length) { const { data: ms } = await db.from("messages").select("id").eq("group_id", central.id).order("created_at"); centralIds.push(...ms.map(x => x.id)) }
    console.log("central messages:", centralIds.length)
    const { error } = await db.from("content_reports").insert([
      { ministry_id: mid, reporter_id: member.id, target_type: "message", target_id: centralIds[Math.max(0, centralIds.length - 3)], reported_user_id: g("Andrew Yun"), reason: "spam", details: "Keeps posting the same joke", status: "open" },
      { ministry_id: mid, reporter_id: admin.id, target_type: "profile", target_id: g("Jacob Im"), reported_user_id: g("Jacob Im"), reason: "other", details: "Not sure this is a real student", status: "open" },
    ]); if (error) die("reports", error)
  }
  const { count: al } = await db.from("audit_logs").select("*", { count: "exact", head: true }).eq("ministry_id", mid)
  if (!al) {
    const { error } = await db.from("audit_logs").insert([
      ["announcement.create", "announcement", ANN.kickoff.id, "Fall Kickoff Night — RSVP so we get enough dessert", -5],
      ["member.role_change", "profile", g("Sarah Kim"), "Sarah Kim", -30, { from: "member", to: "leader" }],
      ["member.role_change", "profile", g("Hannah Choi"), "Hannah Choi", -30, { from: "member", to: "leader" }],
      ["announcement.edit", "announcement", ANN.retreat.id, "Fall Retreat sign-ups are open (deadline next Friday)", -2],
      ["member.remove", "profile", g("Jacob Im"), "Former member", -45],
      ["announcement.delete", "announcement", "00000000-0000-0000-0000-000000000000", "Test post please ignore", -40],
      ["moderation.flag_threshold", "chat", central.id, "E2E Sandbox Chat", -8, { user: "Andrew Yun", count: 5 }],
    ].map(([action, entity_type, entity_id, entity_label, d, metadata]) => ({ ministry_id: mid, actor_id: admin.id, actor_name: "E2E Admin", action, entity_type, entity_id, entity_label, metadata: metadata ?? null, created_at: new Date(Date.now() + d * 864e5).toISOString() })))
    if (error) die("audit", error)
  }
}

mkdirSync(".claude/task-context/design-pass", { recursive: true })
writeFileSync(".claude/task-context/design-pass/seed-manifest.json", JSON.stringify(manifest, null, 1))
console.log("✓ design-pass seed complete")
for (const [t, rows] of Object.entries(manifest)) console.log(`  ${t}: +${rows.length}`)
