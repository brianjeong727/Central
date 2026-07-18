// ─── Event presets — DATA (plain ESM, no TS) ─────────────────────────────────
//
// Single source of truth for the per-event-type playbooks: checklist tasks with
// real T-minus offsets, default roles, and modal-prefill defaults. Everything
// here is distilled from how CCSF actually ran 2025–26 (see context/CCSF_CONTEXT.md
// for provenance — meeting notes, transition notes, and the per-event workbooks).
//
// This file is .mjs so it can be imported BOTH by the app (via the typed wrapper
// app/home/event-presets.ts) and by node seed scripts (scripts/seed-ccsf-events.mjs)
// without a TS loader — the sandbox fixtures and the in-app presets can never drift.
//
// Task shape: { title, off } — `off` is the due-date offset in DAYS relative to
// the event's start date (negative = before, 0 = day-of, positive = after,
// null = no scheduled date). Offsets are lifted from last year's actual dates
// (e.g. Coffeehouse ran Sep 14 with forms out Jul 23 → off: -53).
//
// defaults: what the Add-Event modal prefills when the type is selected — last
// year's title/venue/times/description, with anchorMonth/anchorDay projecting
// the next occurrence (this year if still ahead, else next year).

export const EVENT_PRESET_DATA = {
  welcome_week: {
    label: "Welcome Week", icon: "🎉", dot: "var(--plum)", bg: "var(--plum-tint)", text: "var(--plum)",
    budgetCategory: "welcoming_week", canHaveSubEvents: true,
    description:
      "Two-week freshman welcome across both campuses — Popsicle Socials, Game Day, Involvement Fair, sports, Praise Night, Welcoming Night, Tag-Alongs, The FAIR. Reserve every venue in June.",
    defaults: {
      title: "Welcome Week",
      description:
        "Freshman welcome across CMU + Pitt: Popsicle Socials on each campus, Game Day at Danforth, Pitt Involvement Fair, sports days, First Praise Night, Welcoming Night, and church Tag-Alongs — ending with The FAIR. ~60 freshmen expected; add every newcomer to Central Chat as you go.",
      location: "CMU + Pitt campuses · Central Church",
      startTime: "09:00", endTime: "21:00", allDay: true, durationDays: 14,
      anchorMonth: 8, anchorDay: 17,
    },
    defaultPhases: [
      { key: "pre_event", label: "June–July Planning", tasks: [
        { title: "Reserve church space for Welcoming Night, Praise Night, meetings, DGs, and PMs", off: -60 },
        { title: "Book Danforth Conference Room for Game Day (goes early in the summer)", off: -60 },
        { title: "Budget the week with the treasurers — tabling $50/campus, Game Day ~$20, Welcoming Night ~$200–300, socials ~$40", off: -55 },
        { title: "Plan sub-events and assign a lead pair to each (socials, Game Day, sports, fair, Praise Night, Welcoming Night)", off: -50 },
        { title: "Design promo — welcoming schedule post, then one story (9:16) + post (3:4) per event", off: -30 },
        { title: "Register for CMU REACH + The FAIR (registration opens in August)", off: -21 },
        { title: "Coordinate with DGLs on who cooks each night + Praise Team for Praise Night", off: -14 },
        { title: "Recruit volunteers — 20+ for Popsicle Socials, Game Day greeters, Tag-Along drivers", off: -7 },
        { title: "Print the Welcoming Night QR signup, banner, posterboard, and info cards", off: -5 },
        { title: "Buy supplies — popsicles (~4×20ct/campus), cooler + ice packs, snacks, board games check", off: -3 },
      ]},
      { key: "day_of", label: "Week Of", tasks: [
        { title: "Send daily reminder posts and announcements", off: 0 },
        { title: "Add every freshman to Central Chat at each event + note headcounts", off: 0 },
        { title: "Confirm food orders and grocery runs for each night", off: 0 },
        { title: "Set up each venue (tables, decor, AV) and assign a door greeter", off: 0 },
        { title: "Tag-Along volunteers meet 8:15 AM to bring freshmen to first Sunday service", off: 6 },
        { title: "Welcoming Night signup progress check — chase the form", off: 3 },
      ]},
      { key: "post_event", label: "Post-Week", tasks: [
        { title: "Open DG sign-ups (target: all in the week after Welcoming Night) and check the count", off: 14 },
        { title: "Compile the full new-folks list for DGL follow-up", off: 15 },
        { title: "Submit all reimbursement forms", off: 16 },
        { title: "Post recap photos + thank-you messages to volunteers", off: 16 },
        { title: "CCSF debrief — what worked, what to improve", off: 20 },
      ]},
    ],
    defaultRoles: [
      { name: "President", notes: "Overall lead — final decision maker, coordinates all sub-events and church leadership" },
      { name: "Event Coordinator (CMU)", notes: "CMU venues — the Cut (no tables allowed), Danforth booking, setup/teardown" },
      { name: "Event Coordinator (Pitt)", notes: "Pitt venues — Cathy Lawn, Towers, The Pete fair table, setup/teardown" },
      { name: "Secretary", notes: "Promo graphics (9:16 story + 3:4 post per event), announcements, welcoming schedule, photos" },
      { name: "DGL Liaison", notes: "Dinner cooking rotations with the DGL team + DG signup push after Welcoming Night" },
      { name: "Praise Liaison", notes: "Praise Night worship with Praise Team — contact them 2 weeks out, they usually forget" },
    ],
    extraTabs: ["sub_events"],
  },

  coffeehouse: {
    label: "Coffeehouse", icon: "☕", dot: "var(--warm-tan)", bg: "#FDF6EC", text: "#6B4C1E",
    budgetCategory: "coffeehouse", canHaveSubEvents: false,
    description:
      "Fall talent show at Rangos Hall — ~7 acts (music, dance, skits, testimony) from ~30 signups, run on a form pipeline that starts in July.",
    defaults: {
      title: "Coffeehouse",
      description:
        "Fall talent show — performances, praise, and testimony. Doors/setup 1:30 PM, act practices 2–4:30, show 5–7. ~7 acts from ~30 interest-form signups; each act tracked with leaders, members, duration, practice slot, and stage equipment. Sound = church PA + CMU Ideate loans.",
      location: "Rangos Hall, CMU",
      startTime: "17:00", endTime: "19:00", allDay: false, durationDays: 1,
      anchorMonth: 10, anchorDay: 4,
    },
    defaultPhases: [
      { key: "pre_event", label: "Pre-Event", tasks: [
        { title: "Book Rangos Hall + reserve the date with church", off: -60 },
        { title: "Send out the Coffeehouse interest form (perform / lead / welcome; group + members)", off: -53 },
        { title: "Close interest-form signups", off: -44 },
        { title: "Choose the acts at a board meeting (~7: music, dance, skits, praise, testimony)", off: -36 },
        { title: "Send the performance-leaders form — each act reports members, duration, motive + verse, equipment", off: -20 },
        { title: "Delegate volunteer leads — Performance, Welcoming, Baking (send baking form), Sound", off: -18 },
        { title: "Request sound equipment from church + CMU Ideate (SM-58s ×5, DI boxes ×3, cables)", off: -16 },
        { title: "Post the Instagram promo", off: -13 },
        { title: "Confirm sound equipment pickup", off: -11 },
        { title: "Build the run of show — act order, per-act practice slots (2–4:30), intermission", off: -10 },
        { title: "Performance leaders check-in", off: -9 },
        { title: "Volunteer leaders check-in", off: -7 },
        { title: "Buy day-of supplies — banner, post-its, water, coffee/snacks", off: -3 },
      ]},
      { key: "day_of", label: "Day-of", tasks: [
        { title: "AV + stage setup, doors open 1:30", off: 0 },
        { title: "Run act practices 2–4:30 on the practice-slot schedule", off: 0 },
        { title: "Sound check per act — vocals, instruments, backing tracks", off: 0 },
        { title: "MC briefing + run-of-show walkthrough", off: 0 },
        { title: "Welcome table at the door", off: 0 },
        { title: "Run the show — keep transitions tight, intermission on time", off: 0 },
        { title: "Photos, cleanup, and load-out — venue clear by close", off: 0 },
      ]},
      { key: "post_event", label: "Post-Event", tasks: [
        { title: "Return Ideate + church equipment", off: 1 },
        { title: "Submit reimbursement forms", off: 2 },
        { title: "Post recap photos + thank performers and volunteers", off: 2 },
      ]},
    ],
    defaultRoles: [
      { name: "President", notes: "Owns the pipeline — forms out on time, acts chosen at the board meeting, run-of-show final call" },
      { name: "Performance Lead", notes: "Manages act leaders — member lists, durations, practice slots, equipment needs per act" },
      { name: "Welcoming Lead", notes: "Door, signage, seating — plus outreach push (tabling, flyers) beforehand" },
      { name: "Baking Lead", notes: "Sends the baking form, coordinates bakers and the goods table" },
      { name: "Sound Lead", notes: "Church PA + Ideate loans (5× SM-58, 3× DI, cables); per-act sound checks" },
      { name: "Secretary", notes: "Flyers, IG promo, announcement slides, event photography" },
      { name: "MC / Emcee", notes: "Hosts the night and keeps the program moving" },
    ],
    extraTabs: ["acts"],
  },

  turkey_bowl: {
    label: "Turkey Bowl", icon: "🏈", dot: "var(--sage)", bg: "#EEF4F1", text: "#2D5445",
    budgetCategory: "turkeybowl", canHaveSubEvents: false,
    description:
      "Fall flag football — girls and guys run as separate events (late Oct / early Nov). Shirts are the big line: ~190 at ~$1,530, resold at $10.",
    defaults: {
      title: "Turkeybowl",
      description:
        "Annual flag football. Girls and guys divisions run on separate dates (2026: girls Oct 31, guys Nov 7). ~190 shirts at ~$1,530, sold at $10 each — excess funds water/Gatorade. Signups open right after Coffeehouse with a separate QB track; ~18 players per team, YAs mingled into undergrad teams.",
      location: "Pitt Sports Dome / outdoor field",
      startTime: "10:00", endTime: "14:00", allDay: false, durationDays: 1,
      anchorMonth: 11, anchorDay: 7,
    },
    defaultPhases: [
      { key: "pre_event", label: "Pre-Event", tasks: [
        { title: "Book the venue — the Dome goes fast, check months out and hold a backup field", off: -90 },
        { title: "Release signups right after Coffeehouse — separate quarterback track", off: -30 },
        { title: "Design shirts + send the shirt form (sizes, names)", off: -28 },
        { title: "Submit the shirt order — 3–4 week lead time (~$1,530 for ~190)", off: -25 },
        { title: "Set shirt resale price ($10) and plan excess → water/Gatorade", off: -21 },
        { title: "Post promo graphics + announcement", off: -14 },
        { title: "Build teams and brackets — ~18/team, mingle YAs with undergrads, get the girls' input on team format", off: -10 },
        { title: "Gather equipment — 3+ guys footballs, 1–4 girls footballs, cones, first aid, field markers", off: -7 },
        { title: "Plan awards + prize tracks", off: -7 },
        { title: "Coordinate food, water, and Gatorade", off: -5 },
      ]},
      { key: "day_of", label: "Day-of", tasks: [
        { title: "Field setup — cones, boundaries, end zones", off: 0 },
        { title: "Distribute shirts + collect shirt payments", off: 0 },
        { title: "Run the bracket — keep games on schedule", off: 0 },
        { title: "Serve food and drinks", off: 0 },
        { title: "Award ceremony", off: 0 },
        { title: "Cleanup + return equipment", off: 0 },
      ]},
      { key: "post_event", label: "Post-Event", tasks: [
        { title: "Reconcile shirt sales vs. order cost + submit reimbursements", off: 2 },
        { title: "Post game photos and results", off: 2 },
        { title: "Archive final brackets and scores", off: 3 },
      ]},
    ],
    defaultRoles: [
      { name: "Commissioner", notes: "Runs the bracket — rules, scheduling, officiating (one per division/date)" },
      { name: "Shirt Coordinator", notes: "Design, size form, order (3–4wk lead, ~$1,530/190), $10 resale collection" },
      { name: "Equipment Lead", notes: "Footballs (3+ guys, 1–4 girls), cones, first aid, field markers" },
      { name: "Food Lead", notes: "Water/Gatorade from shirt excess, snacks, serving" },
      { name: "Secretary", notes: "Promo graphics, signups announcement, event photos + results post" },
    ],
    extraTabs: ["teams"],
  },

  retreat: {
    label: "Retreat", icon: "⛺", dot: "var(--body)", bg: "var(--body-bg)", text: "var(--plum)",
    budgetCategory: "retreat", canHaveSubEvents: false,
    description:
      "Overnight retreats — Women's late Oct, Men's early Feb, EM early Mar. Retreat leads (one YA + one undergrad) run program; CCSF co-plans logistics.",
    defaults: {
      title: "Women's Retreat",
      description:
        "Weekend retreat. Retreat leads (one YA + one undergrad) design the program; CCSF handles logistics — lodging, transport, payments, supplies. Annual rhythm: Women's late October · Men's early February · EM early March.",
      location: "Retreat lodge (TBD)",
      startTime: "17:00", endTime: "14:00", allDay: true, durationDays: 3,
      anchorMonth: 10, anchorDay: 23,
    },
    defaultPhases: [
      { key: "pre_event", label: "6 Weeks Out", tasks: [
        { title: "Confirm dates + the retreat lead pair (one YA, one undergrad)", off: -45 },
        { title: "Book the retreat location and confirm capacity", off: -42 },
        { title: "Create the sign-up form with payment collection", off: -30 },
        { title: "Plan transportation — identify drivers, confirm car capacities", off: -21 },
        { title: "Coordinate the program and session schedule with the retreat leads", off: -21 },
        { title: "Coordinate worship sessions with Praise Team", off: -14 },
      ]},
      { key: "day_of", label: "2 Weeks Out", tasks: [
        { title: "Confirm headcount and finalize room assignments", off: -14 },
        { title: "Finalize the transport roster — every rider confirmed with a driver", off: -10 },
        { title: "Send the packing list and logistics info to all attendees", off: -7 },
        { title: "Purchase food, supplies, and retreat materials", off: -5 },
        { title: "Confirm payment collection is complete", off: -3 },
      ]},
      { key: "post_event", label: "Post-Retreat", tasks: [
        { title: "Submit all reimbursement forms (food, supplies, deposits)", off: 2 },
        { title: "CCSF + retreat leads debrief", off: 5 },
        { title: "Follow up with new folks who attended + post photos recap", off: 5 },
      ]},
    ],
    defaultRoles: [
      { name: "Retreat Lead (YA)", notes: "Co-designs and runs the program — paired with the undergrad lead" },
      { name: "Retreat Lead (Undergrad)", notes: "Co-designs and runs the program — paired with the YA lead" },
      { name: "Transportation Coordinator", notes: "Assigns every attendee a driver; confirms car capacities" },
      { name: "Treasurer Liaison", notes: "Sign-up payments, deposits, reimbursements" },
      { name: "Worship Leader", notes: "Leads worship sessions during the retreat" },
      { name: "Logistics Lead", notes: "Food, supplies, lodging check-in, day-of execution" },
    ],
    extraTabs: ["transport"],
  },

  appreciation_night: {
    label: "Appreciation Night", icon: "✨", dot: "#C97BB0", bg: "#FAF0F7", text: "#8A3070",
    budgetCategory: "appreciation_night", canHaveSubEvents: false,
    description:
      "GAN/SAN — February appreciation nights. Guys plan the sisters' night and vice versa. Flowers, food, decor, program.",
    defaults: {
      title: "Appreciation Night (GAN/SAN)",
      description:
        "February appreciation night — guys plan SAN (Sisters Appreciation Night), girls plan GAN. Program + flowers + food + decor at church. Flowers are requested through church (can't be expensed via CMU/Pitt).",
      location: "Central Church",
      startTime: "18:00", endTime: "21:00", allDay: false, durationDays: 1,
      anchorMonth: 2, anchorDay: 20,
    },
    defaultPhases: [
      { key: "pre_event", label: "Pre-Event", tasks: [
        { title: "Reserve the church space", off: -30 },
        { title: "Plan the program — activities, performances, speeches", off: -21 },
        { title: "Design and post the invitation announcement", off: -14 },
        { title: "Recruit helpers for setup, cooking, and service", off: -10 },
        { title: "Order flowers — request through church (not expensable via CMU/Pitt)", off: -7 },
        { title: "Coordinate food and drinks", off: -7 },
      ]},
      { key: "day_of", label: "Day-of", tasks: [
        { title: "Set up decorations, flowers, tables, and lighting", off: 0 },
        { title: "Welcome guests at the door", off: 0 },
        { title: "Run the program — MC keeps it on schedule", off: 0 },
        { title: "Serve food and drinks", off: 0 },
        { title: "Cleanup + lock up (lights, stoves, water, doors)", off: 0 },
      ]},
      { key: "post_event", label: "Post-Event", tasks: [
        { title: "Submit reimbursement forms (flowers, food)", off: 2 },
        { title: "Post photos + thank all helpers", off: 2 },
      ]},
    ],
    defaultRoles: [
      { name: "Event Lead", notes: "Overall lead — the opposite group plans it (guys plan SAN, girls plan GAN)" },
      { name: "Decoration Lead", notes: "Flowers (via church), lighting, table setup — sets the atmosphere" },
      { name: "Food Lead", notes: "Coordinates cooking, food, and drinks" },
      { name: "MC / Emcee", notes: "Hosts the night and runs the program" },
      { name: "Photographer", notes: "Photos and video for the recap" },
    ],
    extraTabs: [],
  },

  social: {
    label: "Social", icon: "🎊", dot: "var(--muted-text)", bg: "var(--cream-panel)", text: "var(--body)",
    budgetCategory: null, canHaveSubEvents: false,
    description:
      "Social events — Churchwide Picnic, EMKM Field Day, Senior Send-off, game nights, hangouts. Volunteers usually pulled from DGs.",
    defaults: {
      title: "Churchwide Picnic",
      description:
        "Joint EM/KM churchwide picnic — volunteers recruited from DGs, announcement + signup out at least a week ahead. (Reuse this type for Field Day, Senior Send-off, game nights, and hangouts.)",
      location: "Park (TBD)",
      startTime: "12:00", endTime: "15:00", allDay: false, durationDays: 1,
      anchorMonth: 9, anchorDay: 20,
    },
    defaultPhases: [
      { key: "pre_event", label: "Pre-Event", tasks: [
        { title: "Reserve the location or confirm the venue", off: -21 },
        { title: "Recruit volunteers (pull from DGs for church-wide events)", off: -14 },
        { title: "Post the announcement + signup", off: -10 },
        { title: "Coordinate food, games, and activity supplies (blankets, balls, board games)", off: -3 },
      ]},
      { key: "day_of", label: "Day-of", tasks: [
        { title: "Setup + welcome people in", off: 0 },
        { title: "Run the activities", off: 0 },
        { title: "Clean up — leave the space how you found it", off: 0 },
      ]},
      { key: "post_event", label: "Post-Event", tasks: [
        { title: "Submit reimbursements + post recap photos", off: 2 },
      ]},
    ],
    defaultRoles: [
      { name: "Event Lead", notes: "Point of contact and day-of coordinator" },
      { name: "Food Coordinator", notes: "Food and drinks logistics" },
      { name: "Volunteer Lead", notes: "Recruits + coordinates DG volunteers" },
    ],
    extraTabs: [],
  },

  ministry: {
    label: "Ministry Event", icon: "🙏", dot: "var(--plum)", bg: "var(--plum-tint)", text: "var(--body)",
    budgetCategory: null, canHaveSubEvents: false,
    description:
      "Praise nights, prayer meetings, DG kickoffs, outreach fairs, evangelism, volunteering. The lock-up checklist rides on every church event.",
    defaults: {
      title: "Praise Night",
      description:
        "Praise + prayer night at church. Reserve the space early, contact the praise leader two weeks out (they usually forget), and remind the DGL president to prep dinner + prayer topics. Whoever closes: lights, stoves, running water, doors.",
      location: "Central Church",
      startTime: "18:00", endTime: "21:00", allDay: false, durationDays: 1,
      anchorMonth: 8, anchorDay: 28,
    },
    defaultPhases: [
      { key: "pre_event", label: "Pre-Event", tasks: [
        { title: "Reserve the church space", off: -45 },
        { title: "Contact the praise leader — 2 weeks out, they usually forget", off: -14 },
        { title: "Remind the DGL president to prep dinner + prayer topics", off: -7 },
        { title: "Announcement + slides for PM/DG/Sunday service", off: -7 },
      ]},
      { key: "day_of", label: "Day-of", tasks: [
        { title: "Set up the space (chairs, AV, kitchen if dinner)", off: 0 },
        { title: "Run the event", off: 0 },
        { title: "Lock up — lights off, stoves off, running water off, doors closed", off: 0 },
      ]},
      { key: "post_event", label: "Post-Event", tasks: [
        { title: "Recap in the chat + log follow-ups", off: 1 },
      ]},
    ],
    defaultRoles: [
      { name: "Facilitator", notes: "Owns the night — space, schedule, announcements" },
      { name: "Worship Lead", notes: "Set list + praise team coordination" },
      { name: "Closer (L.O.C.K)", notes: "Locks up after — lights, stoves, water, doors" },
    ],
    extraTabs: [],
  },
}

// ─── Board-role Resources content (CCSF transition notes, verbatim intent) ───
// Seeded into team_role_descriptions when a Student Org Board workspace is
// created, so the Resources tab starts with the real role guides.
export const BOARD_ROLE_RESOURCES = {
  "President": {
    summary: "Main point of contact with church leadership and the DGL team; runs the board.",
    responsibilities: [
      "Coordinate DG start dates, membership/baptism dates, and in-church events with church leadership; incorporate the pastor's suggestions and feedback",
      "Run board meetings and set agendas — stay ahead of upcoming events, delegate responsibilities to leads, maintain board wellbeing",
      "Coordinate joint EM/KM events (Church Picnic, Field Day) — main POC between both sides, ideally a Korean speaker; find volunteers and communicate plans clearly",
    ],
  },
  "Treasurer": {
    summary: "Tracks budgets for every event and handles all money movement — historically one treasurer per campus (CMU + Pitt).",
    responsibilities: [
      "Estimate and allocate the year's budget at the start of the year; notify each event lead of their budget (cooking / decor / games / gifts)",
      "Handle reimbursements and receipts — DGL dinners, SAN/GAN, SSO, Coffeehouse, Turkeybowl, and any church spending",
      "Apply for school funding (CMU/Pitt org funding; P-card signup opens mid-August) and church funding — flowers and some purchases must go through church",
    ],
  },
  "Secretary": {
    summary: "Owns communication and media for the org.",
    responsibilities: [
      "Send weekly announcements — calendar, Messenger/mailing list — and inform the AV team for slides during PM, DG, and Sunday service",
      "Design & media: flyers, event slides (Coffeehouse etc.), Instagram posts and stories",
      "Capture (or delegate) photos and videos at events",
    ],
  },
  "Event Coordinator": {
    summary: "Owns spaces, equipment, and cleanup — historically two coordinators, one per campus.",
    responsibilities: [
      "Reserve spaces — POC for reserving church, campus rooms, and fields (book Danforth and Turkeybowl venues early)",
      "Handle equipment — responsible (or delegates responsibility) for sound equipment, tables, sports gear",
      "Assign and manage cleanup teams — create event checklists, coordinate setup/teardown",
      "Rotate locking up the church after PMs/DGs/events — lights, stoves, running water, doors",
    ],
  },
}
