// Seed the App Store review demo tenant: a presentable, populated ministry plus
// a reviewer account with full (admin) access. Apple Guideline 2.1 requires demo
// credentials with the backend on — an empty auth-walled app is unreviewable
// (and looks like a "repackaged website" under 4.2).
//
// Idempotent — safe to re-run; finds-or-creates everything by fixed emails/name,
// and only seeds content (announcements/chats/team) when the ministry is empty.
//
//   node --env-file=.env.local scripts/seed-demo.mjs
//
// Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// DEMO_PASSWORD (the reviewer password that goes in App Store Connect review notes).
import { createClient } from "@supabase/supabase-js"
import ws from "ws" // supabase-js needs a WebSocket impl under Node < 22

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = process.env.DEMO_PASSWORD
if (!URL_ || !KEY) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
if (!PASSWORD) throw new Error("Missing DEMO_PASSWORD in .env.local")

const MINISTRY_NAME = "Crossroads College Ministry"
const INVITE_CODE = "CROSSROADS-DEMO"

// The reviewer is ADMIN (2.1 wants the full feature surface: settings, member
// management, announcement CRUD, chat management). central_signup marker set so
// the OAuth mint guard can never mistake these for unknown mints.
const USERS = [
  { email: "demo.reviewer@joincentral.app", name: "Alex Morgan",   role: "admin",   grad: null },
  { email: "demo.sarah@joincentral.app",    name: "Sarah Kim",     role: "leader",  grad: 2027 },
  { email: "demo.james@joincentral.app",    name: "James Park",    role: "member",  grad: 2028 },
  { email: "demo.emily@joincentral.app",    name: "Emily Chen",    role: "member",  grad: 2027 },
  { email: "demo.daniel@joincentral.app",   name: "Daniel Rivera", role: "visitor", grad: 2029 },
]

const db = createClient(URL_, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

async function findOrCreateUser({ email, name }) {
  const { data: page, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) throw listErr
  const existing = page.users.find((u) => u.email === email)
  if (existing) {
    await db.auth.admin.updateUserById(existing.id, { password: PASSWORD })
    return existing.id
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name, central_signup: true },
  })
  if (error) throw error
  return data.user.id
}

const ids = {}
for (const u of USERS) ids[u.email] = await findOrCreateUser(u)
const reviewerId = ids[USERS[0].email]
const sarahId = ids[USERS[1].email]

// ── Ministry ──────────────────────────────────────────────────────────────────
let { data: ministry } = await db.from("ministries").select("id").eq("name", MINISTRY_NAME).maybeSingle()
if (!ministry) {
  const { data, error } = await db
    .from("ministries")
    .insert({
      name: MINISTRY_NAME,
      university: "Pacific State University",
      size: "medium",
      invite_code: INVITE_CODE,
      status: "active",
      is_public: false, // never listed in public ministry discovery
      is_sandbox: true, // allows super POV-switching for demo upkeep
      // Chat moderation ON for the demo tenant — App Store 1.2 asks for a live
      // filtering method; the reviewer should see it working.
      moderation_settings: { enabled: true, behavior: "asterisk_first", strictness: "moderate", scope: "all", photo_enabled: false },
      created_by: reviewerId,
    })
    .select("id")
    .single()
  if (error) throw error
  ministry = data
}
const mid = ministry.id

for (const u of USERS) {
  const { error } = await db
    .from("profiles")
    .update({
      ministry_id: mid,
      role: u.role,
      name: u.name,
      graduation_year: u.grad,
      needs_grad_check: false,
    })
    .eq("id", ids[u.email])
  if (error) throw error
}

// ── Content (announcements / chats / team) — seeded once, when absent ─────────
const { count: annCount } = await db
  .from("announcements").select("id", { count: "exact", head: true }).eq("ministry_id", mid)

if (!annCount) {
  const nextFriday = new Date()
  nextFriday.setDate(nextFriday.getDate() + ((5 - nextFriday.getDay() + 7) % 7 || 7))
  nextFriday.setHours(19, 0, 0, 0)

  const { data: anns, error: annErr } = await db.from("announcements").insert([
    {
      ministry_id: mid, created_by: reviewerId, is_pinned: true, show_attendees: false,
      title: "Welcome to Crossroads!",
      body: "So glad you're here. This is where all our announcements, events, and updates live — check in each week to stay in the loop. Reach out to any leader if you need anything!",
    },
    {
      ministry_id: mid, created_by: sarahId, is_event: true, show_attendees: true,
      event_date: nextFriday.toISOString(),
      title: "Friday Night Worship",
      body: "Join us this Friday at 7pm in the campus chapel for a night of worship and fellowship. Bring a friend — dessert afterward!",
    },
    {
      ministry_id: mid, created_by: sarahId, show_attendees: false,
      title: "Small groups start next week",
      body: "Small group placements are out! Check with your group leader for your meeting time and location. First meetings kick off next week.",
    },
  ]).select("id, is_event")
  if (annErr) throw annErr

  const eventId = anns.find((a) => a.is_event)?.id
  if (eventId) {
    const { error } = await db.from("rsvps").insert(
      [reviewerId, sarahId, ids[USERS[2].email], ids[USERS[3].email]].map((uid) => ({
        announcement_id: eventId, user_id: uid,
      }))
    )
    if (error) throw error
  }
}

// Auto-chat machinery creates the ministry-wide chat on its own, so guards are
// per-group (find-or-create by name), never a bare "any groups exist" count.
const findOrCreateGroup = async (name, type, memberEmails) => {
  let { data: g } = await db.from("groups")
    .select("id").eq("ministry_id", mid).eq("name", name).maybeSingle()
  if (!g) {
    const { data, error } = await db.from("groups")
      .insert({ ministry_id: mid, name, type, created_by: reviewerId })
      .select("id").single()
    if (error) throw error
    g = data
    const { error: gmErr } = await db.from("group_members").insert(
      memberEmails.map((e) => ({ group_id: g.id, user_id: ids[e] }))
    )
    if (gmErr) throw gmErr
  }
  return g.id
}

const seedMessages = async (groupId, msgs) => {
  const { count } = await db.from("messages")
    .select("id", { count: "exact", head: true }).eq("group_id", groupId)
  if (count) return
  // Space message timestamps a minute apart so the thread reads naturally.
  const base = Date.now() - msgs.length * 60_000
  for (let i = 0; i < msgs.length; i++) {
    const { error } = await db.from("messages").insert({
      group_id: groupId, sender_id: ids[msgs[i][0]], content: msgs[i][1],
      created_at: new Date(base + i * 60_000).toISOString(),
    })
    if (error) throw error
  }
}

// The auto-created "<Ministry> Chat" (auto_central_chat) is the real church-wide
// room — seed the main conversation THERE, like a live tenant would have.
const { data: autoChat } = await db.from("groups")
  .select("id").eq("ministry_id", mid).eq("type", "church")
  .ilike("name", "%Ministry Chat%").maybeSingle()
const mainChatId = autoChat?.id
  ?? (await findOrCreateGroup("Crossroads Chat", "church", USERS.map((u) => u.email)))
await seedMessages(mainChatId, [
  ["demo.reviewer@joincentral.app", "Welcome to the Crossroads chat, everyone! 👋"],
  ["demo.sarah@joincentral.app", "So excited for this semester!!"],
  ["demo.james@joincentral.app", "Same! Is worship still Friday at 7?"],
  ["demo.sarah@joincentral.app", "Yes — campus chapel. RSVP on the announcement so we know how much dessert to bring 🙂"],
  ["demo.emily@joincentral.app", "Just RSVP'd! Bringing two friends from my dorm."],
  ["demo.reviewer@joincentral.app", "Love it. See everyone Friday!"],
])

const leadersId = await findOrCreateGroup("Leaders", "church", ["demo.reviewer@joincentral.app", "demo.sarah@joincentral.app"])
await seedMessages(leadersId, [
  ["demo.reviewer@joincentral.app", "Sarah — can you own setup for Friday? I'll handle the announcement + follow-ups."],
  ["demo.sarah@joincentral.app", "On it. I'll grab the chapel keys Thursday."],
])

const dmId = await findOrCreateGroup("Sarah Kim", "dm", ["demo.reviewer@joincentral.app", "demo.sarah@joincentral.app"])
await seedMessages(dmId, [
  ["demo.sarah@joincentral.app", "Hey! Do we have a budget for Friday's dessert?"],
  ["demo.reviewer@joincentral.app", "Yep — keep it under $40 and save the receipt."],
])

const { count: teamCount } = await db
  .from("teams").select("id", { count: "exact", head: true }).eq("ministry_id", mid)

if (!teamCount) {
  const { data: team, error: tErr } = await db.from("teams")
    // "Leadership Team" NAME matters: classifyTeam() (app/home/team-type.ts)
    // routes board/leadership/officer/student-org names to the rich six-section
    // StudentOrgTeamHome workspace. A plain "standard" name would fall back to
    // the thin ministry-calendar hub instead. Keep a matching keyword in the name.
    .insert({
      ministry_id: mid, name: "Leadership Team", team_type: "standard",
      description: "Ministry leadership — planning, meetings, small groups, rotations.",
      created_by: reviewerId,
    })
    .select("id").single()
  if (tErr) throw tErr

  const { data: roles, error: rErr } = await db.from("team_roles").insert([
    { team_id: team.id, name: "President", is_president: true, permissions: ["can_plan_events", "can_manage_members", "can_track_attendance"] },
    { team_id: team.id, name: "Member", is_president: false, permissions: ["can_plan_events"] },
  ]).select("id, is_president")
  if (rErr) throw rErr

  const pres = roles.find((r) => r.is_president).id
  const member = roles.find((r) => !r.is_president).id
  const { error: tmErr } = await db.from("team_members").insert([
    { team_id: team.id, user_id: reviewerId, role_id: pres, added_by: reviewerId },
    { team_id: team.id, user_id: sarahId, role_id: member, added_by: reviewerId },
    { team_id: team.id, user_id: ids[USERS[2].email], role_id: member, added_by: reviewerId },
  ])
  if (tmErr) throw tmErr
}

// Calendar events — so the workspace Calendar (and Home "up next") is populated,
// not empty. Idempotent by title. Anchored to the current week so it always
// reads as upcoming. `category` must be one of welcoming/retreat/social/service/regular.
const leadershipTeam = await db.from("teams")
  .select("id").eq("ministry_id", mid).eq("name", "Leadership Team").maybeSingle()
const leadershipTeamId = leadershipTeam.data?.id ?? null
const startOfWeek = new Date()
startOfWeek.setHours(0, 0, 0, 0)
startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()) // Sunday
const at = (days, hour) => {
  const d = new Date(startOfWeek)
  d.setDate(d.getDate() + days)
  d.setHours(hour)
  return d.toISOString()
}
const EVENTS = [
  { title: "Friday Night Worship", team_id: leadershipTeamId, category: "service", location: "Campus Chapel",
    description: "Worship + fellowship in the campus chapel. Dessert afterward.", start: at(5, 19), end: at(5, 21) },
  { title: "New Student Welcome Dinner", team_id: leadershipTeamId, category: "welcoming", location: "Fellowship Hall",
    description: "Dinner for first-time students, hosted by the leadership team.", start: at(10, 18), end: at(10, 20) },
  { title: "Sunday Service", team_id: null, category: "service", location: "Main Sanctuary",
    description: "Weekly gathering — worship, teaching, community.", start: at(7, 10), end: at(7, 12) },
]
for (const e of EVENTS) {
  const { data: existing } = await db.from("calendar_events")
    .select("id").eq("ministry_id", mid).eq("title", e.title).maybeSingle()
  if (existing) continue
  const { error } = await db.from("calendar_events").insert({
    ministry_id: mid, team_id: e.team_id, title: e.title, description: e.description,
    location: e.location, start_date: e.start, end_date: e.end, all_day: false,
    category: e.category, created_by: reviewerId,
  })
  if (error) throw error
}

console.log(`✓ App Store demo tenant ready`)
console.log(`  ministry: ${MINISTRY_NAME} (${mid})`)
console.log(`  invite code: ${INVITE_CODE}`)
for (const u of USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}`)
console.log(`\nReview-notes credentials: demo.reviewer@joincentral.app / $DEMO_PASSWORD`)
