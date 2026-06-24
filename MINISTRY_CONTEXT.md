# Central Ministry — Operational Context

> This file gives Claude Code a detailed picture of the real-world workflows Central is
> meant to replace. Use it to understand the "why" behind every feature decision and to
> avoid building tools that don't match how the ministry actually operates.
> Last updated: May 2026

---

## What Central Is Replacing

The ministry currently runs on:
- **Facebook Messenger** — main group chat (247 members, hit the 250 limit)
- **Google Drive** — all planning docs, schedules, budget sheets, receipts
- **Google Sheets** — DG schedule, CCSF master sheet, budget tracker
- **Google Forms** — DG sign-ups, event interest forms, leader signups
- **Instagram** — announcements and event posts
- **Venmo/physical receipts** — reimbursement tracking

Central's job is to replace all of this with one calm, organized platform.

---

## The Church Structure

**Central Church** is a Korean-American evangelical church in Pittsburgh with a college
ministry (EM = English Ministry, undergrad) and a young adult ministry (KM = Korean
Ministry, but "YA" in Central's context). The college ministry spans two universities:
- **University of Pittsburgh (Pitt)**
- **Carnegie Mellon University (CMU)**

Both schools share the same ministry workspace in Central. Members have a `school` field
on their profile. Most events are joint; some are school-specific (involvement fairs,
school breaks differ by 1 week).

**Church leadership** (pastors, deacons, elders) = Admin role in Central.
**Student leaders** (CCSF + DGLs) = Leader role in Central.
**Regular members** = Member role.
**New/prospective members** = Visitor role.

---

## CCSF — Student Org Board

CCSF (Central College Student Fellowship) is the student organization board. They are the
administrative backbone of the ministry — they plan all events, manage finances, handle
campus outreach, and coordinate between the church and the student body.

### Current Roles (2026-2027, simplified from prior year)

| Role | Count | School | Key Responsibilities |
|------|-------|--------|---------------------|
| President | 1 | Either | Church liaison, runs board meetings, sets agendas, coordinates EM/KM joint events, delegates everything |
| Treasurer | 2 | One Pitt, one CMU | Budget tracking, reimbursements, school funding applications (CMU JFC + Pitt), church fund requests |
| Secretary | 1 | Either | Weekly announcements, Instagram, flyers, slides for events, photos/video |
| Event Coordinator | 2 | One Pitt, one CMU | Space reservations, equipment, setup/teardown, cleanup teams, checklist management |

> **Removed from prior year:** Inreach, Outreach, YA Liaison — those responsibilities
> absorbed into Event Coordinator and President roles.

### How CCSF Operates Week to Week

- **Biweekly meetings** at church (~1 hour). Start of year = weekly, longer.
- Each meeting: updates from each role, upcoming event review, budget review, task delegation with deadlines.
- **Sunday Lunch Prayer rotation** — each CCSF member leads congregational prayer on
  a rotating Sunday. This is tracked in the schedule.
- **Lock-up rotation** — members rotate locking the church and cleaning up after PM/DG/events.
- President maintains a master calendar of all events and deadlines.

### Annual Event Calendar

| Event | Month | Led By | Notes |
|-------|-------|--------|-------|
| Welcoming Week (Popsicle Socials, Game Night, Sports, Welcoming Night, Praise Night) | August | All CCSF | Plan in June. Reserve spaces in June. Most logistically complex week of year. |
| DG Sign-up Form | September (week 1) | Secretary | Google Form → members submit name, school, year, gender |
| DG Group Creation | September | Student Org Board | Uses Group Generator in Central to create groups by gender + grade |
| Coffeehouse | September | President (performances), Secretary (media), Event Coord (sound/space) | Talent show format. Performances + praise + testimony. Book Rangos Hall. |
| Church Picnic | September | Event Coord + President | Joint EM/KM event |
| Turkeybowl | November | President + Event Coord | Flag football tournament. Separate men's and women's. ~$1500 for shirts. |
| Women's Retreat | October | Separate retreat leaders (CCSF assists) | |
| Men's Retreat | February | Separate retreat leaders (CCSF assists) | |
| GAN (Guys Appreciation Night) | February | Event Coord | |
| SAN (Sisters Appreciation Night) | February | Event Coord | |
| EM Retreat | March | Separate retreat leaders | |
| EM/KM Field Day | March/April | President (EM/KM liaison) | Joint event, needs Korean speaker |
| SSO (Senior Send-off) | April | Junior class (NOT CCSF) | See SSO section below |
| Community Volunteering | Ongoing | Event Coord | Wilkinsburg Food Pantry etc. |
| IM Sports | Ongoing | Event Coord | Intramural sports teams |

### Finance Workflow (Very Detailed)

Three funding pools:
1. **CMU (JFC)** — applied for at start of year via TartanConnect. Covers Welcome events, Coffeehouse, some SSO/SAN items.
2. **Pitt** — covers Pitt-specific events and large event overflow.
3. **Church** — covers DG dinners (~$100-185/week every Friday), praise/prayer events, membership flowers.

**Budget tracker columns (currently a Google Sheet):**
Week | Event | Event Date | Description | Amount | Purchase Date | Purchaser | School | Requested from CMU | Requested from Pitt | Requested from Church | Status | Reimbursement Confirmation | Notes

**Reimbursement flow:**
1. Someone buys supplies/groceries and keeps receipt
2. They submit a reimbursement form (currently PDF) with receipt attached
3. Treasurer submits to appropriate fund
4. Status: Pending → Approved → Reimbursed
5. Pitt Treasurer handles Pitt + Church funds. CMU Treasurer handles CMU funds.

**In Central, this should work as:**
- Any leader/member can submit a receipt: photo + amount + event category + fund request + notes
- Treasurer sees all submissions in a Finance tab with status management
- Treasurer can mark as Approved / Reimbursed
- Export to CSV/spreadsheet for submission to CMU TartanConnect or Pitt systems

**Typical spend per event:**
- DG dinner: $100-185 (every Friday, church funded)
- Welcoming Night: ~$200
- Coffeehouse: ~$123
- SSO: varies
- Turkeybowl: ~$1,500-1,700 (shirts dominate)
- Membership flowers: ~$158

---

## DGLs — Small Group Leaders

### Structure

- ~14 DGLs split by gender (exact number changes each year)
- Each DGL leads their own small group of ~10-13 members
- Male DGLs lead male-only groups; female DGLs lead female-only groups
- Each male DGL is **paired** with a female DGL — their groups are "brother/sister" groups
- YA (Young Adult) DGs are completely separate — different leaders, no tools needed

### The Weekly Rotation

The schedule has 4 columns. Each DGL gets assigned once (or twice if necessary due to headcount) per semester to each role:

| Day | Assignment | Who |
|-----|-----------|-----|
| Sunday | Congregational prayer + dishes | 1 DGL |
| Wednesday | Lead PM (Prayer Meeting) | 1 DGL |
| Friday | Cook dinner + lead DG | 1 **pair** of DGLs (brother + sister group together) |

> **Critical:** Friday is ALWAYS a pair. The brother DGL and sister DGL whose groups are
> paired cook together and lead their groups together that week. The rotation assigner
> must assign Fridays as pairs, never as individuals.

### DGL Responsibilities
- Lead their small group every Friday (when not on cooking rotation, others cook for them)
- Cook dinner for the whole congregation when it's their paired Friday
- Lead PM on assigned Wednesdays
- Lead congregational prayer + do dishes on assigned Sundays
- Take each member out for a 1-on-1 meal each semester (tracked with meal toggle in Central)
- Attend DGL meetings (run by DGL President, synced with CCSF)

### DG Group Formation (Changed This Year)

**Previously:** DGL President created groups manually.
**Now:** CCSF/Student Org Board runs the Group Generator in Central to create groups.

Process:
1. DG Sign-up Form opens in September (name, school, year, gender)
2. Student Org Board uses Group Generator with Small Group Mode ON
3. Algorithm assigns members to DGL groups by gender + grade balance
4. CCSF confirms groups → auto-creates small group chats

### DGL President Role
- Confirms the DGL roster at the start of each semester
- Sets brother/sister pairings
- Runs the rotation assigner to generate the semester schedule
- Reviews and publishes the schedule
- Manages DGL meetings and communication
- Coordinates with CCSF Inreach (now absorbed into President/Event Coord roles)

### Receipt Submission for DG Dinners
- Every Friday cooking pair submits their grocery receipt in Central
- Photo of receipt + amount + "DG Dinner" category + church fund
- Treasurer processes reimbursement

---

## SSO — Senior Send-off

- **Led by:** The junior class (NOT CCSF)
- **When:** April (near end of spring semester)
- **What:** A celebration event honoring graduating seniors
- **Planning:** Juniors self-organize. In Central, a temporary "SSO Planning" team is
  created by CCSF each year, all juniors are added, and they get access to the Student
  Org Board event planning tools for this one event. After SSO the team is archived.
- **Finance:** Funded like any other event — receipts submitted through Central,
  Treasurer processes reimbursement.

---

## YA (Young Adult) DGs

- Completely separate from undergraduate DGs
- YA leaders are regular members/leaders in their YA groups
- No scheduling tools, no rotation, no cooking assignments
- Just group membership tracking in Central
- YA groups are visible in the directory but don't participate in the DGL rotation system

---

## Key Workflows Central Needs to Handle

### Weekly Rhythm
1. **Friday:** Assigned DGL pair cooks dinner → submits receipt in Central
2. **Wednesday:** Assigned DGL leads PM → can access set list + slides via their assignment card
3. **Sunday:** Assigned DGL leads prayer + dishes

### Start of Semester
1. DGL President confirms roster
2. DGL President sets brother/sister pairings
3. DGLs mark availability (specific dates they can't serve)
4. DGL President generates rotation
5. DGL President publishes rotation → all DGLs see their assignments

### Start of Year
1. CCSF sets up annual calendar
2. DG sign-up form goes out
3. Student Org Board runs Group Generator (small group mode) to assign members to DGLs
4. Groups confirmed → small group chats auto-created
5. SSO Planning team created (juniors added)

### Finance (Ongoing)
1. Anyone buys something for ministry → submits receipt in Central
2. Treasurer reviews → marks Approved
3. Treasurer submits to external fund (CMU/Pitt/Church) → marks Reimbursed
4. Full history exportable as CSV

---

## What's NOT in Central (Yet)

- **School funding applications** (CMU TartanConnect, Pitt portal) — Central tracks
  what to apply for but doesn't integrate with school systems
- **Instagram posting** — Central helps Secretary draft content but doesn't post
- **SongSelect** — praise team uses manually uploaded charts for now
- **Email/mailing list** — announcements sent separately via messenger still

---

## Terminology Glossary

| Term | Meaning |
|------|---------|
| DG | Discipleship Group (small group) |
| DGL | Discipleship Group Leader |
| PM | Prayer Meeting (Wednesday nights) |
| EM | English Ministry (college students) |
| KM | Korean Ministry (Korean-speaking congregation) |
| YA | Young Adults (post-college members) |
| CCSF | Central College Student Fellowship (student org board) |
| SSO | Senior Send-off (junior-led senior farewell event) |
| SAN | Sisters Appreciation Night |
| GAN | Guys Appreciation Night |
| L.O.C.K | A CCSF role handling church care/cleanup |
| Turkeybowl | Annual flag football tournament (November) |
| Coffeehouse | Annual talent show + praise event (September) |
| The FAIR | Campus involvement fair (outreach event) |
| Welcoming Night | Annual freshmen welcome event (August) |
| Brother/Sister pairing | A male DGL and female DGL whose groups are paired for joint Fridays |
