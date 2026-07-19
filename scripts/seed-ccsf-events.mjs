// Seed the full 2026–27 CCSF event calendar into a sandbox ministry's Student
// Org Board — every event type preset instantiated on its real date, plus the
// Welcome Week sub-events (with the Welcoming Night workbook checklist) and the
// board-role Resources guides. Fixtures for verifying the presets against how
// 2025–26 actually ran (context/CCSF_CONTEXT.md).
//
//   node --env-file=.env.local scripts/seed-ccsf-events.mjs
//   node --env-file=.env.local scripts/seed-ccsf-events.mjs --ministry "E2E Sandbox"
//
// Idempotent: re-running deletes and re-creates exactly the fixture events it
// owns (matched by title within the target board team) — nothing else.
//
// Task due dates come from the SAME preset data the app seeds from
// (app/home/event-presets-data.mjs) — offsets applied to each event's real
// date, NOT past-clamped: planning tasks whose date has passed are marked
// completed instead, so the Countdown reads like a season in progress.

import { createClient } from "@supabase/supabase-js"
import ws from "ws"
import { EVENT_PRESET_DATA, BOARD_ROLE_RESOURCES, lineageKeyOf, seasonLabelOf } from "../app/home/event-presets-data.mjs"

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")

const argIdx = process.argv.indexOf("--ministry")
const MINISTRY_NAME = argIdx > -1 ? process.argv[argIdx + 1] : "Brian's Sandbox"
const BOARD_TEAM_NAME = "Student Org Board"

const db = createClient(URL_, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

// ── date helpers (plain YMD math, matching the app's convention) ─────────────
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}
const todayYMD = new Date().toISOString().slice(0, 10)
// Store timestamps with the America/New_York offset for that date (EDT/EST-aware)
// so the app's LOCAL display renders the real calendar times. (The app itself
// writes naive `+00:00` from the modal and displays local — a pre-existing
// storage/display mismatch; fixtures side-step it so verification reads true.)
const etOffset = (ymd) => {
  const probe = new Date(`${ymd}T12:00:00Z`)
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(probe).find((p) => p.type === "timeZoneName").value // e.g. "GMT-4"
  const m = part.match(/GMT([+-])(\d+)/)
  return `${m[1]}${String(Number(m[2])).padStart(2, "0")}:00`
}
const ts = (ymd, hhmm) => `${ymd}T${hhmm}:00${etOffset(ymd)}`

// ── fixture calendar (2026–27, per the CCSF transition-notes calendar) ───────
// type: EVENT_PRESET_DATA key. tasks/roles omitted → seeded from the preset.
// Custom `tasks`/`roles` (sub-events) override the preset entirely.
const EVENTS = [
  {
    key: "welcome_week", type: "welcome_week", title: "Welcome Week",
    date: "2026-08-17", endDate: "2026-08-30", allDay: true,
    location: "CMU + Pitt campuses · Central Church",
    description: "Freshman welcome across CMU + Pitt — Popsicle Socials, Game Day, Involvement Fair, sports days, First Praise Night, Welcoming Night, Tag-Alongs, The FAIR. ~60 freshmen expected.",
    turnout: 60, budget: 500,
    subEvents: [
      {
        type: "social", title: "Popsicle Social (CMU)", date: "2026-08-18", start: "12:00", end: "14:00",
        location: "The Cut, CMU",
        description: "Orientation-week popsicle giveaway — no registration and no table allowed at the Cut; hand out from coolers. ~30 newcomers expected, 20+ volunteers.",
        turnout: 30, budget: 40,
        tasks: [
          { phase: "pre_event", label: "Pre-Event", items: [
            { title: "Buy ~4× 20ct ice pops / ice-cream sandwiches", off: -2 },
            { title: "Borrow cooler + ice packs from church/people", off: -2 },
            { title: "Find a driver for supplies", off: -3 },
            { title: "Confirm 20+ volunteers", off: -4 },
          ]},
          { phase: "day_of", label: "Day-of", items: [
            { title: "Hand out popsicles, meet freshmen, collect contacts into Central Chat", off: 0 },
            { title: "Note the freshmen headcount", off: 0 },
          ]},
        ],
        roles: [
          { name: "Social Lead", notes: "Runs the giveaway — remember: no table allowed at the Cut" },
          { name: "Driver", notes: "Supplies run — pops, cooler, ice packs" },
        ],
      },
      {
        type: "social", title: "Popsicle Social (Pitt)", date: "2026-08-19", start: "12:00", end: "14:00",
        location: "Cathy Lawn, Pitt",
        description: "Pitt twin of the CMU social — popsicles at Cathy Lawn/Towers during orientation week.",
        turnout: 30, budget: 40,
        tasks: [
          { phase: "pre_event", label: "Pre-Event", items: [
            { title: "Buy ~4× 20ct ice pops (second run) + restock ice packs", off: -1 },
            { title: "Confirm volunteers + driver", off: -3 },
          ]},
          { phase: "day_of", label: "Day-of", items: [
            { title: "Hand out popsicles, meet freshmen, add to Central Chat", off: 0 },
            { title: "Note the freshmen headcount + check Welcoming Night signup progress", off: 0 },
          ]},
        ],
        roles: [{ name: "Social Lead", notes: "Cathy Lawn setup — bring picnic blankets" }],
      },
      {
        type: "social", title: "Game Day", date: "2026-08-21", start: "15:00", end: "18:00",
        location: "Danforth Conference Room, CMU",
        description: "Board games + Switch for ~100 people across ~6 tables. Room has HDMI. Danforth must be booked early in the summer.",
        turnout: 100, budget: 20,
        tasks: [
          { phase: "pre_event", label: "Pre-Event", items: [
            { title: "Book Danforth Conference Room (early summer — it goes fast)", off: -60 },
            { title: "Borrow a Switch + controllers and board games for ~6 tables", off: -3 },
            { title: "Buy snacks, plates, chips, drinks (~$20)", off: -1 },
            { title: "Assign door greeters to walk people to games", off: -2 },
          ]},
          { phase: "day_of", label: "Day-of", items: [
            { title: "Set up tables, games, and the Switch on the room HDMI", off: 0 },
            { title: "Greet at the door and place people into games", off: 0 },
            { title: "Add freshmen to Central Chat + headcount", off: 0 },
            { title: "Clean the room and reset furniture", off: 0 },
          ]},
        ],
        roles: [
          { name: "Game Day Lead", notes: "~100 turnout last year — enough games for 50 at once" },
          { name: "Door Greeter", notes: "Nobody stands alone — walk newcomers into a game" },
        ],
      },
      {
        type: "ministry", title: "Pitt Involvement Fair", date: "2026-08-23", start: "13:00", end: "16:00",
        location: "The Pete, Pitt",
        description: "Club-fair tabling — banner, posterboard, info cards, QR signups.",
        tasks: [
          { phase: "pre_event", label: "Pre-Event", items: [
            { title: "Register the table with Pitt", off: -21 },
            { title: "Bring banner + make/refresh the posterboard (print photos)", off: -3 },
            { title: "Print info cards + Welcoming Night QR signup", off: -2 },
            { title: "Staff the table — 4+ volunteers in shifts", off: -3 },
          ]},
          { phase: "day_of", label: "Day-of", items: [
            { title: "Table, collect contacts, plug Welcoming Night", off: 0 },
          ]},
        ],
        roles: [{ name: "Tabling Lead", notes: "Owns banner/posterboard/cards kit between fairs" }],
      },
      {
        type: "social", title: "Sports Day (Pitt)", date: "2026-08-25", start: "14:00", end: "16:00",
        location: "Cathy Lawn, Pitt",
        description: "Open sports hang — volleyball, spikeball, football on Cathy Lawn. Open event, bring as many people as possible.",
        tasks: [
          { phase: "pre_event", label: "Pre-Event", items: [
            { title: "Gather balls, volleyball net, spikeball set, ~5 picnic blankets", off: -2 },
            { title: "Push the announcement — open event, everyone brings someone", off: -2 },
          ]},
          { phase: "day_of", label: "Day-of", items: [
            { title: "Set up nets + games, rotate people in", off: 0 },
            { title: "Add freshmen to Central Chat + headcount", off: 0 },
          ]},
        ],
        roles: [{ name: "Sports Lead", notes: "Equipment owner — collect it all back at the end" }],
      },
      {
        type: "social", title: "Sports Day (CMU)", date: "2026-08-27", start: "14:00", end: "16:00",
        location: "The Cut, CMU",
        description: "CMU twin of the Pitt sports day — same kit, the Cut.",
        tasks: [
          { phase: "pre_event", label: "Pre-Event", items: [
            { title: "Re-stage the sports kit (balls, net, spikeball, blankets)", off: -1 },
          ]},
          { phase: "day_of", label: "Day-of", items: [
            { title: "Run the games + headcount + Central Chat adds", off: 0 },
          ]},
        ],
        roles: [{ name: "Sports Lead", notes: "Same kit as Pitt day — check nothing went missing" }],
      },
      {
        type: "ministry", title: "First Praise Night", date: "2026-08-28", start: "18:00", end: "21:00",
        location: "Central Church",
        description: "First praise night of the year — praise practice 1:30 and 5–5:30 before Welcoming Night weekend. DGL president preps dinner + prayer topics.",
        tasks: [
          { phase: "pre_event", label: "Pre-Event", items: [
            { title: "Reserve the church space (done with the June block)", off: -60 },
            { title: "Contact the praise leader — 2 weeks out, they usually forget", off: -14 },
            { title: "Remind the DGL president: dinner + prayer topics", off: -7 },
            { title: "Announcement + slides", off: -7 },
          ]},
          { phase: "day_of", label: "Day-of", items: [
            { title: "Set up chairs, AV, kitchen", off: 0 },
            { title: "Run the night", off: 0 },
            { title: "L.O.C.K close — lights, stoves, running water, doors", off: 0 },
          ]},
        ],
        roles: [
          { name: "Praise Liaison", notes: "Coordinates the praise team + set list" },
          { name: "Closer (L.O.C.K)", notes: "Lights, stoves, water, doors — every church night" },
        ],
      },
      {
        type: "social", title: "Welcoming Night", date: "2026-08-29", start: "17:30", end: "21:45",
        location: "Central Church",
        description: "THE anchor event — dinner, praise, intros, games, gifts for the incoming freshmen. 2025: 45 of 61 freshmen came; prep for 60. Budget ~$300 (2025 actuals: gifts $28.59 · decor $46 · food $127.05). Run by the sophomores in 2026–27.",
        turnout: 60, budget: 300,
        tasks: [
          { phase: "pre_event", label: "June → Week-of", items: [
            { title: "Reserve church space for the night", off: -69 },
            { title: "Send out the volunteer sign-up form", off: -69 },
            { title: "Finalize volunteer groups — Praise, Decor/Gifts, Food, Games, Welcoming, MCs", off: -28 },
            { title: "Begin praise practice", off: -6 },
            { title: "Send freshmen sign-up forms + print the QR code", off: -4 },
            { title: "General grade meeting — walk everyone through the night", off: -3 },
            { title: "Buy food, gifts, and decor (2025: gifts $28.59, decor $46, food $127.05)", off: -2 },
            { title: "Decor + gifts prep night", off: -1 },
            { title: "Expect forms to run 2 days late — pad every deadline", off: -5 },
          ]},
          { phase: "day_of", label: "Run of Show", items: [
            { title: "1:30 PM — praise practice + volunteers arrive", off: 0 },
            { title: "4:00 PM — kitchen opens for cooking", off: 0 },
            { title: "5:30 PM — freshmen arrive, welcoming team at the door", off: 0 },
            { title: "6:00 PM — dinner", off: 0 },
            { title: "7:00 PM — praise", off: 0 },
            { title: "7:30 PM — introductions + CCSF intro", off: 0 },
            { title: "8:00 PM — games (CCSF + DGLs clean the kitchen during)", off: 0 },
            { title: "8:45 PM — gifts + photos", off: 0 },
            { title: "9:15 PM — cleanup while photos wrap", off: 0 },
            { title: "9:45 PM — doors closed", off: 0 },
          ]},
          { phase: "post_event", label: "Post-Event", items: [
            { title: "Open DG sign-ups + check the count two days later", off: 2 },
            { title: "Compile the new-folks list for DGL follow-up", off: 2 },
            { title: "Submit reimbursements + thank the volunteer teams", off: 3 },
          ]},
        ],
        roles: [
          { name: "Event Lead ×2", notes: "2025: one lead pair owned the night end-to-end" },
          { name: "Praise Lead", notes: "~6-person praise team — practice starts the week before" },
          { name: "Decor/Gifts Lead", notes: "~12-person team — decor, gift boxes, room styling" },
          { name: "Food Lead", notes: "~9-person team — kitchen opens 4 PM, dinner at 6" },
          { name: "Games Leads", notes: "Every remaining volunteer facilitates an assigned game team" },
          { name: "Welcoming Lead", notes: "Door team — greet, tag, and seat freshmen" },
          { name: "MC ×2", notes: "Host the program — intros, transitions, games" },
        ],
      },
    ],
  },
  {
    key: "the_fair", type: "ministry", title: "The FAIR", date: "2026-09-02", start: "16:30", end: "18:30",
    location: "The Cut, CMU",
    description: "CMU fall outreach event — register via CMU REACH in August. 6+ volunteers.",
    tasks: [
      { phase: "pre_event", label: "Pre-Event", items: [
        { title: "Register when applying for CMU REACH (August)", off: -14 },
        { title: "Recruit 6+ volunteers", off: -7 },
        { title: "Bring the tabling kit — banner, info cards, QR signups", off: -1 },
      ]},
      { phase: "day_of", label: "Day-of", items: [
        { title: "Run the table + collect contacts", off: 0 },
      ]},
    ],
    roles: [{ name: "Outreach Lead", notes: "Owns REACH registration + the volunteer roster" }],
  },
  {
    key: "first_dgs", type: "ministry", title: "First DGs", date: "2026-09-11", start: "18:00", end: "21:00",
    location: "Central Church",
    description: "DG kickoff — Friday-night discipleship groups begin (6–9 PM weekly through the semester). All signups should be in the week after Welcoming Night.",
    tasks: [
      { phase: "pre_event", label: "Pre-Event", items: [
        { title: "Chase DG sign-ups — target: everyone in by the week after Welcoming Night", off: -10 },
        { title: "DGLs create signup forms + confirm rosters", off: -7 },
        { title: "Sync the DG schedule with the DGL team", off: -5 },
      ]},
      { phase: "day_of", label: "Day-of", items: [
        { title: "First DG night — dinner rotations start", off: 0 },
        { title: "L.O.C.K close after", off: 0 },
      ]},
    ],
    roles: [{ name: "DGL Liaison", notes: "CCSF ↔ DGL bridge for signups + cooking rotations" }],
  },
  {
    key: "picnic", type: "social", title: "Churchwide Picnic", date: "2026-09-20", start: "12:00", end: "15:00",
    location: "Park (TBD)",
    description: "Joint EM/KM churchwide picnic — volunteers pulled from DGs; president is the main POC between both ministries.",
    turnout: 150, budget: 200,
  },
  {
    key: "coffeehouse", type: "coffeehouse", title: "Coffeehouse", date: "2026-10-04", start: "17:00", end: "19:00",
    location: "Rangos Hall, CMU",
    turnout: 120, budget: 150,
  },
  {
    key: "womens_retreat", type: "retreat", title: "Women's Retreat", date: "2026-10-23", endDate: "2026-10-25", allDay: true,
    location: "Retreat lodge (TBD)",
    description: "Women's retreat — retreat leads (one YA + one undergrad) run program, CCSF co-plans logistics.",
    turnout: 40, budget: 800,
  },
  {
    key: "girls_tb", type: "turkey_bowl", title: "Girls Turkeybowl", date: "2026-10-31", start: "10:00", end: "13:00",
    location: "Pitt Sports Dome (indoor)",
    description: "Girls flag football — separate date from the guys' bowl (2025 lesson: ~27 non-QB undergrad girls, YA girls mingled into teams, indoor slot preferred).",
    turnout: 60, budget: 500,
  },
  {
    key: "guys_tb", type: "turkey_bowl", title: "Guys Turkeybowl", date: "2026-11-07", start: "10:00", end: "14:00",
    location: "Outdoor field / Gesling backup",
    description: "Guys flag football — 2025: 65 non-QB signups → 6 teams of ~18, YAs mingled in. Shirts are the big line (~190 at ~$1,530, sold at $10).",
    turnout: 130, budget: 1200,
  },
  {
    key: "mens_retreat", type: "retreat", title: "Men's Retreat", date: "2027-02-05", endDate: "2027-02-07", allDay: true,
    location: "Retreat lodge (TBD)",
    description: "Men's retreat — CCSF co-plans with the retreat lead pair (one YA + one undergrad).",
    turnout: 40, budget: 800,
  },
  {
    key: "gan", type: "appreciation_night", title: "Guys Appreciation Night (GAN)", date: "2027-02-20", start: "18:00", end: "21:00",
    location: "Central Church",
    description: "The girls plan GAN for the guys (the guys return SAN). Flowers via church, food, decor, program.",
    turnout: 80, budget: 250,
  },
  {
    key: "em_retreat", type: "retreat", title: "EM Retreat", date: "2027-03-05", endDate: "2027-03-07", allDay: true,
    location: "Retreat lodge (TBD)",
    description: "All-EM retreat — around the CMU/Pitt spring breaks.",
    turnout: 80, budget: 1500,
  },
  {
    key: "field_day", type: "social", title: "EMKM Field Day", date: "2027-03-27", start: "13:00", end: "16:00",
    location: "Field (TBD)",
    description: "Joint EM/KM field day — volleyball, soccer, football, spikeball, frisbee. ~60 turnout, ~$40; bring ~5 picnic blankets + board games, buy water + snacks (skipped last year — don't).",
    turnout: 60, budget: 40,
  },
  {
    key: "sso", type: "social", title: "Senior Send-off (SSO)", date: "2027-04-10", start: "18:00", end: "21:00",
    location: "Central Church",
    description: "Send-off night celebrating the graduating seniors — program + food + gifts.",
    turnout: 80, budget: 250,
  },
]

// ── 2025–26 HISTORY: the season as it actually ran (completed events) ────────
// Same fixture shapes re-dated to last year's real calendar. These seed as
// COMPLETED events (every task done at its offset date) and each top-level one
// (plus Welcoming Night) is compiled onto the SHELF as a "2025–26" playbook —
// the Run-it-back source for this year's board.
// 2025-26 reality diffs: only ONE sports day ran; no Women's Retreat yet.
const HISTORY_DATES = {
  "Welcome Week": { date: "2025-08-16", endDate: "2025-08-30" },
  "Popsicle Social (CMU)": { date: "2025-08-19" },
  "Popsicle Social (Pitt)": { date: "2025-08-20" },
  "Game Day": { date: "2025-08-25" },
  "Pitt Involvement Fair": { date: "2025-08-24" },
  "Sports Day (Pitt)": { date: "2025-08-27" },
  "Sports Day (CMU)": null, // didn't run in 2025-26
  "First Praise Night": { date: "2025-08-29" },
  "Welcoming Night": { date: "2025-08-30" },
  "The FAIR": { date: "2025-09-03" },
  "First DGs": { date: "2025-09-05" },
  "Churchwide Picnic": { date: "2025-09-21" },
  "Coffeehouse": { date: "2025-09-14" },
  "Women's Retreat": null, // introduced 2026-27
  "Girls Turkeybowl": { date: "2025-11-08" },
  "Guys Turkeybowl": { date: "2025-11-15" },
  "Men's Retreat": { date: "2026-02-13", endDate: "2026-02-15" },
  "Guys Appreciation Night (GAN)": { date: "2026-02-21" },
  "EM Retreat": { date: "2026-03-06", endDate: "2026-03-08" },
  "EMKM Field Day": { date: "2026-03-28" },
  "Senior Send-off (SSO)": { date: "2026-04-11" },
}

// Build the history season from the same EVENTS definitions with re-mapped dates.
function toHistory(ev) {
  const h = HISTORY_DATES[ev.title]
  if (!h) return null
  const shifted = { ...ev, date: h.date, endDate: h.endDate ?? (ev.endDate ? h.date : undefined) }
  if (ev.subEvents) {
    shifted.subEvents = ev.subEvents.map(toHistory).filter(Boolean)
  }
  return shifted
}

// ── helpers ──────────────────────────────────────────────────────────────────
const log = (...a) => console.log(...a)

function presetTaskGroups(type) {
  return EVENT_PRESET_DATA[type].defaultPhases.map((p) => ({
    phase: p.key, label: p.label,
    items: p.tasks.map((t) => ({ title: t.title, off: t.off })),
  }))
}
function presetRoles(type) {
  return EVENT_PRESET_DATA[type].defaultRoles
}

async function seedEvent(ev, { ministryId, teamId, createdBy, parentId = null }) {
  const endDate = ev.endDate ?? ev.date
  const startTs = ev.allDay ? ts(ev.date, "00:00") : ts(ev.date, ev.start)
  const endTs = ev.allDay ? `${endDate}T23:59:59${etOffset(endDate)}` : ts(endDate, ev.end)
  const cfg = EVENT_PRESET_DATA[ev.type]
  const categoryMap = { welcome_week: "welcoming", coffeehouse: "social", turkey_bowl: "social", retreat: "retreat", appreciation_night: "social", social: "social", ministry: "regular" }

  const { data: event, error: evErr } = await db.from("calendar_events").insert({
    ministry_id: ministryId, team_id: teamId,
    title: ev.title,
    description: ev.description ?? cfg.defaults.description,
    location: ev.location ?? cfg.defaults.location,
    start_date: startTs, end_date: endTs,
    all_day: !!ev.allDay,
    category: categoryMap[ev.type] ?? "regular",
    event_type: ev.type,
    parent_event_id: parentId,
    created_by: createdBy,
  }).select("id").single()
  if (evErr) throw new Error(`${ev.title}: ${evErr.message}`)

  const groups = ev.tasks ?? presetTaskGroups(ev.type)
  const roles = ev.roles ?? presetRoles(ev.type)
  const offsets = groups.flatMap((g) => g.items.map((i) => i.off)).filter((o) => o !== null)
  const earliest = offsets.length ? Math.min(...offsets) : -30

  const { data: plan, error: planErr } = await db.from("event_plans").insert({
    ministry_id: ministryId, calendar_event_id: event.id, created_by: createdBy,
    expected_turnout: ev.turnout ?? null,
    budget_allocated: ev.budget ?? null,
    plan_start_date: addDays(ev.date, Math.min(earliest, -14)),
    crunch_date: addDays(ev.date, -7),
  }).select("id").single()
  if (planErr) throw new Error(`${ev.title} plan: ${planErr.message}`)

  let sort = 0
  const taskRows = []
  for (const g of groups) {
    for (const item of g.items) {
      const due = item.off === null ? null : addDays(ev.date, item.off)
      // Real timeline, not clamped: past-due planning work reads as done.
      const done = due !== null && due < todayYMD
      taskRows.push({
        event_plan_id: plan.id, title: item.title, phase: g.phase,
        due_date: due, sort_order: sort++, completed: done,
        completed_at: done ? `${due}T17:00:00+00:00` : null,
        created_by: createdBy,
      })
    }
  }
  if (taskRows.length) {
    const { error } = await db.from("event_tasks").insert(taskRows)
    if (error) throw new Error(`${ev.title} tasks: ${error.message}`)
  }
  if (roles.length) {
    const { error } = await db.from("event_roles").insert(
      roles.map((r) => ({ event_plan_id: plan.id, role_name: r.name, notes: r.notes || null, assigned_to: null, created_by: createdBy })),
    )
    if (error) throw new Error(`${ev.title} roles: ${error.message}`)
  }
  return { eventId: event.id, planId: plan.id, groups, roles }
}

// Compile a seeded HISTORY event onto the shelf: one event_templates row per
// (lineage, season) with template_tasks carrying the preset offsets and
// template_roles carrying the role guides. source_event_plan_id points at the
// history plan so Run-it-back can copy the real venue/times/duration.
async function compileToShelf(ev, seeded, { ministryId, teamId, createdBy }) {
  const stats = {
    actual_turnout: ev.turnout ?? null,
    task_count: seeded.groups.reduce((n, g) => n + g.items.length, 0),
    on_time_pct: 100,
  }
  const { data: tpl, error: tplErr } = await db.from("event_templates").insert({
    ministry_id: ministryId,
    team_id: teamId,
    event_type: ev.type,
    lineage_key: lineageKeyOf(ev.title),
    name: ev.title,
    source_event_plan_id: seeded.planId,
    year_label: seasonLabelOf(ev.date),
    extra_notes: [],
    stats,
    created_by: createdBy,
  }).select("id").single()
  if (tplErr) throw new Error(`template ${ev.title}: ${tplErr.message}`)

  let sort = 0
  const taskRows = []
  for (const g of seeded.groups) {
    for (const item of g.items) {
      taskRows.push({
        template_id: tpl.id, title: item.title, phase: g.phase,
        offset_days: item.off, actual_offset_days: item.off,
        brief: null, role_hint: null, parent_id: null, sort_order: sort++,
      })
    }
  }
  if (taskRows.length) {
    const { error } = await db.from("template_tasks").insert(taskRows)
    if (error) throw new Error(`template tasks ${ev.title}: ${error.message}`)
  }
  if (seeded.roles.length) {
    const { error } = await db.from("template_roles").insert(
      seeded.roles.map((r, i) => ({ template_id: tpl.id, role_name: r.name, notes: r.notes || null, sort_order: i })),
    )
    if (error) throw new Error(`template roles ${ev.title}: ${error.message}`)
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const { data: ministry, error: minErr } = await db
  .from("ministries").select("id, created_by").eq("name", MINISTRY_NAME).maybeSingle()
if (minErr || !ministry) throw new Error(`Ministry "${MINISTRY_NAME}" not found`)
const ministryId = ministry.id
const createdBy = ministry.created_by
log(`Ministry: ${MINISTRY_NAME} (${ministryId})`)

const { data: team } = await db
  .from("teams").select("id").eq("ministry_id", ministryId).eq("name", BOARD_TEAM_NAME).maybeSingle()
if (!team) throw new Error(`Team "${BOARD_TEAM_NAME}" not found in ${MINISTRY_NAME}`)
const teamId = team.id
log(`Board team: ${teamId}`)

// 1) Ensure the four preset board roles exist (Resources tabs render per real role).
const PRESET_ROLES = [
  { name: "President", is_president: true, permissions: ["can_plan_events", "can_view_finances", "can_manage_members", "can_track_attendance", "can_manage_team"] },
  { name: "Secretary", is_president: false, permissions: ["can_plan_events", "can_manage_members", "can_track_attendance"] },
  { name: "Treasurer", is_president: false, permissions: ["can_view_finances", "can_plan_events"] },
  { name: "Event Coordinator", is_president: false, permissions: ["can_plan_events", "can_track_attendance"] },
]
const { data: existingRoles } = await db.from("team_roles").select("name").eq("team_id", teamId)
const have = new Set((existingRoles ?? []).map((r) => r.name))
const missingRoles = PRESET_ROLES.filter((r) => !have.has(r.name))
if (missingRoles.length) {
  const { error } = await db.from("team_roles").insert(
    missingRoles.map((r) => ({ team_id: teamId, name: r.name, permissions: r.permissions, is_president: r.is_president && !have.has("President") })),
  )
  if (error) throw error
  log(`Added roles: ${missingRoles.map((r) => r.name).join(", ")}`)
}

// 2) Upsert the Resources-tab role guides (transition-notes content).
for (const [roleName, guide] of Object.entries(BOARD_ROLE_RESOURCES)) {
  const { error } = await db.from("team_role_descriptions").upsert({
    team_id: teamId, role_name: roleName,
    summary: guide.summary, responsibilities: guide.responsibilities,
    created_by: createdBy, updated_by: createdBy, updated_at: new Date().toISOString(),
  }, { onConflict: "team_id,role_name" })
  if (error) throw new Error(`resources ${roleName}: ${error.message}`)
}
log(`Role guides upserted: ${Object.keys(BOARD_ROLE_RESOURCES).join(", ")}`)

// 3) Wipe previously-seeded fixtures: shelf templates first, then events (children first).
const FIXTURE_TITLES = [
  ...EVENTS.map((e) => e.title),
  ...EVENTS.flatMap((e) => (e.subEvents ?? []).map((s) => s.title)),
]
const FIXTURE_LINEAGES = [...new Set(FIXTURE_TITLES.map(lineageKeyOf))]
const { data: oldTpls } = await db
  .from("event_templates").select("id")
  .eq("ministry_id", ministryId).eq("team_id", teamId).in("lineage_key", FIXTURE_LINEAGES)
if (oldTpls?.length) {
  const tplIds = oldTpls.map((t) => t.id)
  await db.from("template_tasks").delete().in("template_id", tplIds)
  await db.from("template_roles").delete().in("template_id", tplIds)
  await db.from("event_templates").delete().in("id", tplIds)
  log(`Cleared ${tplIds.length} previously-seeded shelf templates`)
}
const { data: oldEvents } = await db
  .from("calendar_events").select("id, parent_event_id")
  .eq("ministry_id", ministryId).eq("team_id", teamId).in("title", FIXTURE_TITLES)
if (oldEvents?.length) {
  const ids = oldEvents.map((e) => e.id)
  const { data: oldPlans } = await db.from("event_plans").select("id").in("calendar_event_id", ids)
  const planIds = (oldPlans ?? []).map((p) => p.id)
  if (planIds.length) {
    await db.from("event_tasks").delete().in("event_plan_id", planIds)
    await db.from("event_roles").delete().in("event_plan_id", planIds)
    await db.from("event_notes").delete().in("event_plan_id", planIds)
    await db.from("event_plans").delete().in("id", planIds)
  }
  // children before parents (FK parent_event_id)
  const children = oldEvents.filter((e) => e.parent_event_id).map((e) => e.id)
  if (children.length) await db.from("calendar_events").delete().in("id", children)
  const parents = oldEvents.filter((e) => !e.parent_event_id).map((e) => e.id)
  if (parents.length) await db.from("calendar_events").delete().in("id", parents)
  log(`Cleared ${ids.length} previously-seeded events`)
}

// 4) Seed the 2025–26 HISTORY season (completed) + compile the shelf.
const seedCtx = { ministryId, teamId, createdBy }
let eventCount = 0
let shelfCount = 0
for (const src of EVENTS) {
  const hist = toHistory(src)
  if (!hist) continue
  const seeded = await seedEvent(hist, seedCtx)
  eventCount++
  await compileToShelf(hist, seeded, seedCtx)
  shelfCount++
  for (const sub of hist.subEvents ?? []) {
    const subSeeded = await seedEvent(sub, { ...seedCtx, parentId: seeded.eventId })
    eventCount++
    // Welcoming Night is a shelf entry in its own right — the anchor single event.
    if (sub.title === "Welcoming Night") {
      await compileToShelf(sub, subSeeded, seedCtx)
      shelfCount++
    }
  }
  log(`  ✓ [2025–26] ${hist.title}${hist.subEvents?.length ? ` (+${hist.subEvents.length} sub-events)` : ""}`)
}

// 5) Seed the 2026–27 upcoming calendar.
for (const ev of EVENTS) {
  const seeded = await seedEvent(ev, seedCtx)
  eventCount++
  for (const sub of ev.subEvents ?? []) {
    await seedEvent(sub, { ...seedCtx, parentId: seeded.eventId })
    eventCount++
  }
  log(`  ✓ [2026–27] ${ev.title}${ev.subEvents ? ` (+${ev.subEvents.length} sub-events)` : ""}`)
}
log(`\nSeeded ${eventCount} events + ${shelfCount} shelf playbooks into ${MINISTRY_NAME} / ${BOARD_TEAM_NAME}.`)
