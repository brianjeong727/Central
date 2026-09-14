# Design pass · Batch 0 — The Map

What Central is, as a system of screens, described before it is judged. This is the frame every later batch refers to. Coverage numbers at the end are from the capture manifest.

---

## 1. The shape of the app

Central is **one shell with ten rooms**, reached three ways:

- **Desktop:** a plum icon rail (Home · Messages · Workspace · People · Network · You) + a context panel that changes meaning per room + a breadcrumb bar. The context panel is the second nav level; collapsing the rail removes it entirely.
- **Phone:** a floating plum pill (Home · Chats · Announcements · Workspace · Profile — four items for a member, five with a workspace) + one chrome row per screen + hub-and-spoke drilling with a back chevron / edge swipe.
- **URL:** `/home?tab=` + per-room params (`ann`, `chat`, `team/sotab/sgltab/evtab/fsec/rteam/notetab`, `member`, `section/jtab/pset`, `stab`, `fresp`, `cq`). Every room is deep-linkable; drills reset when you leave a room.

Outside the shell: the public entry (landing, login, signup, ministries discovery, invite link, register/onboarding wizard, pending), legal pages, and the founder console.

## 2. The rooms and what lives in each

| Room | Section (desktop panel) | Who | What it holds |
|---|---|---|---|
| **Home** | Overview · Announcements · Give · Forms (L) · Church Settings (A) · Congregation (P) | everyone | greeting, setup checklist (A), featured hero (curated slides / pinned announcement / active pulse question), chat strip, **my deadlines**, "for you" announcements, verse |
| **Announcements** | (Home panel) | everyone; create L | feed, event RSVP, forms attached, acknowledgment, pin, drafts (L) |
| **Forms** | (Home panel) | L | builder, responses, attach to announcement |
| **Church Settings** | General · People · Governance · Automations · Chat · Reports · Workspace · Audit Log | A | ministry profile, discovery, schools, giving, verses, roles, governance matrix, auto-chats, moderation, reports queue, join codes, requests, ICS, funds, receipt limits, audit |
| **Congregation** | (Home panel) | P | pulse questions + responses |
| **Give** | (Home panel) | everyone (web) | Zelle / card offering |
| **Messages** | conversation list (Church / Mine / Open) | everyone | church chats (general/groups/teams), personal chats, open groups, DMs, thread, polls, reactions, settings, calls |
| **Workspace** (Plan) | picker → per-team sections | team members, gov admins; volunteers get a flat list | Student Org Board (calendar, notes, events, resources, groups, rotations), Small Group Leaders (home*, schedule, Bible study), Finance (allocation, budget, reimbursements), plain teams (calendar), Receipts (side-tree over all teams), **event workspace** (overview, countdown, roles, run of show + acts/teams/transport/sub-events) |
| **People** | member list | everyone | directory, member sheet, report/block |
| **You** | Profile · Journal · Sign out | everyone | identity, about/faith, notifications, account links, danger zone; devotionals/prayers/verses |
| **Network** | — | A | coming-soon card |

\* phone-only.

## 3. The grammar Central follows (mostly)

These are the implicit rules the app obeys. They are good rules; the later batches are largely about where they are broken.

1. **Room → section → sub-tab → drill.** Tabs on the rail, sections in the panel, underline strips inside a section, a subpage for one object.
2. **Creates live in the body header of the collection they fill,** as the one plum primary; object config (the gear) lives in the title row.
3. **Settings stage behind Save;** conversational writes are optimistic.
4. **Phone is hub-and-spoke:** a hub of rows with plain-English subtitles, one chrome row, one 20px gutter, one chevron back.
5. **One object, one card family** — cream surfaces, ivory borderless cards on phone, plum as a surgical accent.
6. **Roles gate rooms, not decoration:** admin-tier sees Settings and Network; leaders create; pastors see Congregation; members and visitors see the same thing.

## 4. Where one object lives in many places

| Object | Homes |
|---|---|
| An event | Home hero · Home deadlines · board Events list · board calendar · board sidebar tree · plain-team calendar · volunteer "You're on" · phone hub hero · announcements (if linked) |
| A person | Directory · member sheet · chat roster · team settings members · DGL roster · rotation slots · availability grid · event roles · Settings › People |
| A receipt | Receipts workspace (submit) · Finance › Reimbursements (approve) · Finance › Budget (posted) |
| A chat | Messages list · Home chat strip · team settings "Group chat" · small-group chat link |
| A DG group | Board › Groups (generated) · SGL › Home › My groups (phone) · auto-created chat |

Batches 1–9 judge each network; Batch 10 takes the whole system apart.

## 5. Coverage — populated state

Every inventory ID × viewport. "✓ n shots (roles)" = captured directly; "↳ in X" = visible inside X's capture; "SKIPPED — reason" = could not be reached by the rig and is reviewed from code; "n/a" = the screen exists only at the other width. Nothing is silently dropped.

### N1

| ID | desktop | mobile |
|---|---|---|
| N1.1 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |
| N1.2 | ✓ 2 shots (visitor) | ✓ 4 shots (visitor) |
| N1.2.1 | SKIPPED — No-account-for-provider error needs an OAuth round trip; reviewed from code. | SKIPPED — No-account-for-provider error needs an OAuth round trip; reviewed from code. |
| N1.3 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |
| N1.3.1 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |
| N1.3.2 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |
| N1.3.3 | SKIPPED — Verify-code step needs a real OTP email; reviewed from code. | SKIPPED — Verify-code step needs a real OTP email; reviewed from code. |
| N1.4 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |
| N1.5 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |
| N1.6 | ✓ 2 shots (member) | ✓ 2 shots (member) |
| N1.7 | ✓ 4 shots (visitor, member) | ✓ 4 shots (visitor, member) |
| N1.7.1 | ✓ 2 shots (member) | ✓ 2 shots (member) |
| N1.7.2 | SKIPPED — Duplicate-account dialog needs a second account with the same name; reviewed from code. | SKIPPED — Duplicate-account dialog needs a second account with the same name; reviewed from code. |
| N1.7.3 | SKIPPED — Post-join pickers fire once after a join; reviewed from code. | SKIPPED — Post-join pickers fire once after a join; reviewed from code. |
| N1.7.4 | SKIPPED — Staff role picker fires on a staff-code join; reviewed from code. | SKIPPED — Staff role picker fires on a staff-code join; reviewed from code. |
| N1.7.5 | SKIPPED — Same InviteShareModal as N2.11. | SKIPPED — Same InviteShareModal as N2.11. |
| N1.8 | ✓ 4 shots (visitor, member) | ✓ 4 shots (visitor, member) |
| N1.8.1 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |
| N1.9 | ✓ 4 shots (visitor, member) | ✓ 4 shots (visitor, member) |
| N1.10 | ↳ in N1.10.1 | ↳ in N1.10.1 |
| N1.10.1 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N1.10.2 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N1.10.3 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N1.10.4 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N1.11 | SKIPPED — Pending page needs a ministry in 'pending' status; neither sandbox is. Reviewed from code. | SKIPPED — Pending page needs a ministry in 'pending' status; neither sandbox is. Reviewed from code. |
| N1.12 | ✓ 2 shots (member) | ✓ 2 shots (member) |
| N1.13 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |
| N1.14 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |
| N1.15 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |
| N1.16 | ✓ 2 shots (visitor) | ✓ 2 shots (visitor) |

### N2

| ID | desktop | mobile |
|---|---|---|
| N2.1 | ↳ in N2.3 | n/a |
| N2.1.1 | ✓ 1 shot (admin) | n/a |
| N2.1.2 | SKIPPED — Workspace nav-hint bubble is a one-time transient (profiles.seen_workspace_nav_hint); reviewed from code (desktop-nav.tsx). | n/a |
| N2.1.3 | ↳ in N2.3 | n/a |
| N2.2 | n/a | ↳ in N2.4 |
| N2.3 | ✓ 10 shots (admin, pastor, leader, member, visitor) | n/a |
| N2.3.1 | ↳ in N2.3 | n/a |
| N2.3.2 | ↳ in N2.3 | n/a |
| N2.3.3 | ↳ in N2.3 | n/a |
| N2.3.4 | ↳ in N2.3 | n/a |
| N2.3.5 | ↳ in N2.3 | n/a |
| N2.3.6 | ↳ in N2.3 | n/a |
| N2.4 | n/a | ✓ 10 shots (admin, pastor, leader, member, visitor) |
| N2.4.1 | n/a | ↳ in N2.4 |
| N2.4.2 | n/a | ↳ in N2.4 |
| N2.4.3 | n/a | ↳ in N2.4 |
| N2.4.4 | n/a | ↳ in N2.4 |
| N2.4.5 | n/a | ↳ in N2.4 |
| N2.4.6 | n/a | ↳ in N2.4 |
| N2.4.7 | n/a | ↳ in N2.4 |
| N2.4.8 | n/a | ↳ in N2.4 |
| N2.4.9 | n/a | ↳ in N2.4 |
| N2.5 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N2.6 | ✓ 4 shots (admin) | n/a |
| N2.7 | ↳ in N5.4 | ↳ in N5.5.2 |
| N2.8 | n/a | ✓ 2 shots (admin) |
| N2.9 | SKIPPED — Super switcher is gated on the founder UUID; no test login can render it. Review from code + Brian's own screen. | SKIPPED — Super switcher is gated on the founder UUID; no test login can render it. Review from code + Brian's own screen. |
| N2.10 | SKIPPED — Desktop member-actions kebab did not open under the rig; the report modal is captured on mobile (N2.10) and the menu reviewed from code (member-sheet.tsx MemberActionsMenu). | ✓ 1 shot (admin) |
| N2.11 | ↳ in N6.7.2 | ✓ 2 shots (admin) |
| N2.12 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N2.13 | ✓ 2 shots (member) | ✓ 2 shots (member) |
| N2.14 | SKIPPED — Pending veil / pull-to-refresh are transient gesture states; reviewed from code. | SKIPPED — Pending veil / pull-to-refresh are transient gesture states; reviewed from code. |

### N3

| ID | desktop | mobile |
|---|---|---|
| N3.1 | ✓ 11 shots (admin, member) | n/a |
| N3.2 | n/a | ✓ 9 shots (admin, member) |
| N3.3 | ✓ 3 shots (admin) | ↳ in N3.2 |
| N3.4 | ✓ 9 shots (admin) | ✓ 6 shots (admin) |
| N3.5 | ✓ 19 shots (admin, member) | ✓ 19 shots (admin, member) |
| N3.5.1 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N3.6 | SKIPPED — /announcements/<id> is a redirect stub to the tab — nothing renders. | SKIPPED — /announcements/<id> is a redirect stub to the tab — nothing renders. |
| N3.7 | ✓ 3 shots (admin) | ✓ 3 shots (admin) |
| N3.8 | ✓ 6 shots (admin) | ✓ 6 shots (admin) |
| N3.9 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N3.10 | ✓ 3 shots (admin) | ✓ 6 shots (admin) |

### N4

| ID | desktop | mobile |
|---|---|---|
| N4.1 | n/a | ✓ 4 shots (admin, member) |
| N4.1.1 | ↳ in N4.2 | ↳ in N4.1 |
| N4.1.2 | SKIPPED — locator.click: Timeout 8000ms exceeded. | ✓ 2 shots (admin) |
| N4.1.3 | n/a | ↳ in N4.3 |
| N4.2 | ✓ 6 shots (admin, member) | n/a |
| N4.3 | ✓ 1 shot (admin) | ✓ 2 shots (admin) |
| N4.4 | ✓ 2 shots (admin) | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.5 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 6000ms exceeded. |
| N4.6 | ✓ 8 shots (admin, member) | ✓ 8 shots (admin, member) |
| N4.6.1 | ↳ in N4.6 | ↳ in N4.6 |
| N4.6.2 | ↳ in N4.6 | ↳ in N4.6 |
| N4.6.3 | ↳ in N4.6 | ↳ in N4.6 |
| N4.6.4 | ✓ 2 shots (admin) | ✓ 1 shot (admin) |
| N4.6.5 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N4.6.6 | ✓ 2 shots (admin) | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.6.7 | SKIPPED — locator.scrollIntoViewIfNeeded: Timeout 8000ms exceeded. | SKIPPED — locator.scrollIntoViewIfNeeded: Timeout 8000ms exceeded. |
| N4.6.8 | ✓ 2 shots (admin) | ✓ 1 shot (admin) |
| N4.6.9 | SKIPPED — Forward sheet opens from the context menu; menu captured in N4.6.5. | SKIPPED — Forward sheet opens from the context menu; menu captured in N4.6.5. |
| N4.6.10 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.6.11 | ↳ in N4.6 | ↳ in N4.6 |
| N4.6.12 | ↳ in N4.6 | ↳ in N4.6 |
| N4.6.13 | SKIPPED — Invite card renders only after an in-chat invite is sent; reviewed from code. | SKIPPED — Invite card renders only after an in-chat invite is sent; reviewed from code. |
| N4.6.14 | ↳ in N4.6 | ↳ in N4.6 |
| N4.7 | SKIPPED — locator.click: Timeout 5000ms exceeded. | ✓ 3 shots (admin) |
| N4.7.1 | ↳ in N4.7 | ↳ in N4.7 |
| N4.7.2 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.7.3 | ↳ in N4.7 | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.7.4 | ↳ in N4.7 | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.7.5 | ↳ in N4.7 | ↳ in N4.7 |
| N4.7.6 | ↳ in N4.7 | ↳ in N4.7 |
| N4.7.7 | ↳ in N4.7 | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.7.8 | ↳ in N4.7 | ↳ in N4.7 |
| N4.7.9 | ↳ in N4.7 | ↳ in N4.7 |
| N4.7.10 | ↳ in N4.7 | ↳ in N4.7 |
| N4.7.11 | ↳ in N4.7 | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.7.12 | ↳ in N4.7 | ↳ in N4.7 |
| N4.8 | ↳ in N4.8.1 | ↳ in N4.8.1 |
| N4.8.1 | SKIPPED — Calls need a LiveKit room + media device; the ring/overlay are reviewed from code and the in-thread call affordances in N4.6.1. | SKIPPED — Calls need a LiveKit room + media device; the ring/overlay are reviewed from code and the in-thread call affordances in N4.6.1. |
| N4.8.2 | SKIPPED — Incoming-call surface not reproducible headless. | SKIPPED — Incoming-call surface not reproducible headless. |
| N4.8.3 | SKIPPED — Video stage not reproducible headless. | SKIPPED — Video stage not reproducible headless. |
| N4.8.4 | SKIPPED — Video grid not reproducible headless. | SKIPPED — Video grid not reproducible headless. |
| N4.8.5 | SKIPPED — Screen share not reproducible headless. | SKIPPED — Screen share not reproducible headless. |
| N4.9 | n/a | SKIPPED — locator.click: Timeout 8000ms exceeded. |

### N5

| ID | desktop | mobile |
|---|---|---|
| N5.1 | ✓ 2 shots (admin, member) | n/a |
| N5.2 | n/a | ✓ 2 shots (admin, member) |
| N5.3 | ✓ 2 shots (admin, member) | ✓ 2 shots (admin, member) |
| N5.3.1 | SKIPPED — Desktop member-actions kebab did not open under the rig; the report modal is captured on mobile (N2.10) and the menu reviewed from code (member-sheet.tsx MemberActionsMenu). | ✓ 1 shot (admin) |
| N5.3.2 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N5.4 | ✓ 2 shots (admin, member) | n/a |
| N5.5 | n/a | ✓ 2 shots (admin, member) |
| N5.5.1 | n/a | ✓ 1 shot (admin) |
| N5.5.2 | n/a | ✓ 1 shot (admin) |
| N5.5.3 | n/a | ✓ 1 shot (admin) |
| N5.5.4 | n/a | ✓ 1 shot (admin) |
| N5.6 | ↳ in N5.6.1 | ↳ in N5.6.1 |
| N5.6.1 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N5.6.2 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N5.6.3 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N5.7 | SKIPPED — Class-change prompt fires on a graduation-year transition; reviewed from code. | SKIPPED — Class-change prompt fires on a graduation-year transition; reviewed from code. |
| N5.8 | ↳ in N5.8.1 | ↳ in N5.8.1 |
| N5.8.1 | ✓ 1 shot (pastor) | ✓ 1 shot (pastor) |
| N5.8.2 | ✓ 1 shot (pastor) | ✓ 1 shot (pastor) |
| N5.8.3 | ✓ 1 shot (pastor) | ✓ 1 shot (pastor) |
| N5.9 | ✓ 2 shots (admin, member) | ✓ 2 shots (admin, member) |

### N6

| ID | desktop | mobile |
|---|---|---|
| N6.0 | n/a | ✓ 4 shots (admin, pastor) |
| N6.1 | ✓ 4 shots (admin, pastor) | ✓ 2 shots (admin) |
| N6.1.1 | ↳ in N6.1 | ↳ in N6.1 |
| N6.1.2 | ↳ in N6.1 | ↳ in N6.1 |
| N6.1.3 | ✓ 1 shot (admin) | ↳ in N6.1 |
| N6.1.4 | ↳ in N6.1 | ↳ in N6.1 |
| N6.1.5 | ↳ in N6.1 | ↳ in N6.1 |
| N6.1.6 | ↳ in N6.1 | ↳ in N6.1 |
| N6.2 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N6.2.1 | ↳ in N6.2 | ↳ in N6.2 |
| N6.2.2 | ↳ in N6.2 | ↳ in N6.2 |
| N6.2.3 | SKIPPED — Role-change confirm: the row action menu did not open under the rig; reviewed from code (settings-tab.tsx:2775) and the People capture. | SKIPPED — Role-change confirm: the row action menu did not open under the rig; reviewed from code (settings-tab.tsx:2775) and the People capture. |
| N6.2.4 | SKIPPED — Excommunicate is destructive; not exercised. Reviewed from code + the row menu shot. | SKIPPED — Excommunicate is destructive; not exercised. Reviewed from code + the row menu shot. |
| N6.3 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N6.3.1 | ↳ in N6.3 | ↳ in N6.3 |
| N6.3.2 | ↳ in N6.3 | ↳ in N6.3 |
| N6.4 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N6.5 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N6.6 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N6.7 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N6.7.1 | ↳ in N6.7 | ↳ in N6.7 |
| N6.7.2 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N6.7.3 | ↳ in N6.7 | ↳ in N6.7 |
| N6.7.4 | ↳ in N6.7 | ↳ in N6.7 |
| N6.7.5 | ↳ in N6.7 | ↳ in N6.7 |
| N6.7.6 | ↳ in N6.7 | ↳ in N6.7 |
| N6.7.7 | ↳ in N6.7 | ↳ in N6.7 |
| N6.8 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N6.9 | ✓ 2 shots (admin) | ↳ in N6.1 |

### N7

| ID | desktop | mobile |
|---|---|---|
| N7.0 | ✓ 4 shots (member) | ✓ 4 shots (member) |
| N7.1 | ✓ 4 shots (admin, member) | ✓ 4 shots (admin, member) |
| N7.1.1 | ✓ 2 shots (admin) | ✓ 1 shot (admin) |
| N7.1.2 | ↳ in N7.2 | n/a |
| N7.2 | ✓ 4 shots (admin, member) | ✓ 4 shots (admin, member) |
| N7.2.1 | n/a | ↳ in N7.2 |
| N7.2.2 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.2.3 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.2.4 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.2.5 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.2.6 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.2.7 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.2.8 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N7.3 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.3.1 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.3.2 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.3.3 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.3.4 | ↳ in N8.1 | ↳ in N8.1 |
| N7.3.5 | SKIPPED — Add-sub-event is the same modal as N7.3 with a parent set; the container it feeds is captured (N8.5). | SKIPPED — Add-sub-event is the same modal as N7.3 with a parent set; the container it feeds is captured (N8.5). |
| N7.4 | ✓ 4 shots (admin, member) | ✓ 4 shots (admin, member) |
| N7.4.1 | n/a | ↳ in N7.4 |
| N7.4.2 | ✓ 4 shots (admin, member) | ✓ 4 shots (admin, member) |
| N7.4.3 | ↳ in N7.4.2 | ↳ in N7.4.2 |
| N7.4.4 | ↳ in N7.4.2 | ↳ in N7.4.2 |
| N7.4.5 | ↳ in N7.4.2 | ↳ in N7.4.2 |
| N7.4.6 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.4.7 | ↳ in N7.4.6 | ↳ in N7.4.6 |
| N7.4.8 | ✓ 4 shots (admin, member) | ✓ 4 shots (admin, member) |
| N7.4.9 | ✓ 2 shots (admin) | ✓ 1 shot (admin) |
| N7.5 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.5.1 | ↳ in N7.5 | n/a |
| N7.5.2 | ✓ 2 shots (admin) | n/a |
| N7.5.3 | n/a | ✓ 2 shots (admin) |
| N7.5.4 | n/a | ↳ in N7.5.3 |
| N7.6 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.6.1 | ↳ in N7.6 | ↳ in N7.6 |
| N7.6.2 | ↳ in N7.6 | ↳ in N7.6 |
| N7.6.3 | ↳ in N7.6 | ↳ in N7.6 |
| N7.7 | ↳ in N7.2.6 | ↳ in N7.2.6 |
| N7.7.1 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.8 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.8.1 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.8.2 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.8.3 | ✓ 1 shot (admin) | SKIPPED — Group-generator preview step: the Generate press timed out on the phone run; reviewed from the desktop capture. |
| N7.8.4 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |
| N7.9 | ↳ in N7.9.1 | ↳ in N7.9.2 |
| N7.9.1 | ✓ 5 shots (admin, member) | n/a |
| N7.9.2 | n/a | ✓ 5 shots (admin, member) |
| N7.9.3 | ✓ 5 shots (admin, member) | ✓ 5 shots (admin, member) |
| N7.9.4 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N7.9.5 | SKIPPED — Delete-category confirm is destructive on seeded categories; reviewed from code + the ConfirmDialog pattern shot (N6.1.3). | SKIPPED — Delete-category confirm is destructive on seeded categories; reviewed from code + the ConfirmDialog pattern shot (N6.1.3). |

### N8

| ID | desktop | mobile |
|---|---|---|
| N8.0 | n/a | ✓ 5 shots (admin, member) |
| N8.1 | ✓ 5 shots (admin, member) | ✓ 5 shots (admin, member) |
| N8.2 | ✓ 8 shots (admin, member) | ✓ 3 shots (admin, member) |
| N8.2.1 | ✓ 1 shot (admin) | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N8.3 | ✓ 4 shots (admin, member) | ✓ 3 shots (admin, member) |
| N8.4 | ✓ 6 shots (admin) | ✓ 4 shots (admin) |
| N8.4.1 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N8.5 | ✓ 1 shot (admin) | ✓ 2 shots (admin) |
| N8.6 | ↳ in N8.6.1 | ↳ in N8.6.1 |
| N8.6.1 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N8.6.2 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N8.6.3 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N8.7 | ✓ 2 shots (admin) | ✓ 3 shots (admin) |
| N8.8 | ✓ 2 shots (admin) | ✓ 3 shots (admin) |
| N8.9 | ✓ 2 shots (admin) | ✓ 3 shots (admin) |
| N8.10 | SKIPPED — Gov-view read-only mat needs a governance admin who is NOT a team member; captured in the empty-state lane instead if reachable. | SKIPPED — Gov-view read-only mat needs a governance admin who is NOT a team member; captured in the empty-state lane instead if reachable. |
| N8.11 | ↳ in N8.1 | ↳ in N8.1 |
| N8.12 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |

### N9

| ID | desktop | mobile |
|---|---|---|
| N9.0 | n/a | ✓ 3 shots (admin) |
| N9.1 | ✓ 6 shots (admin) | ✓ 3 shots (admin) |
| N9.2 | ✓ 3 shots (admin) | ✓ 3 shots (admin) |
| N9.3 | ✓ 3 shots (admin) | ✓ 3 shots (admin) |
| N9.3.1 | ✓ 3 shots (admin) | ✓ 2 shots (admin) |
| N9.3.2 | ↳ in N9.3.1 | ↳ in N9.3.1 |
| N9.3.3 | SKIPPED — Decline dialog: the Decline control was not reachable in the detail capture; reviewed from code (finance-workspace.tsx ~806-828). | SKIPPED — Decline dialog: the Decline control was not reachable in the detail capture; reviewed from code (finance-workspace.tsx ~806-828). |
| N9.3.4 | SKIPPED — Undo toast appears only after an approve; approve is a real write — not exercised. | SKIPPED — Undo toast appears only after an approve; approve is a real write — not exercised. |
| N9.4 | ✓ 5 shots (member, admin) | ✓ 5 shots (member, admin) |
| N9.5 | ↳ in N5.9 | ↳ in N5.9 |

### N10

| ID | desktop | mobile |
|---|---|---|
| N10.1 | SKIPPED — /admin is gated on the founder's email in proxy.ts; no test login can open it. Reviewed from code. | SKIPPED — /admin is gated on the founder's email in proxy.ts; no test login can open it. Reviewed from code. |
| N10.2 | ✓ 2 shots (admin) | ✓ 2 shots (admin) |

### Totals

| viewport | captured | covered | skipped | n/a | missing |
|---|---|---|---|---|---|
| desktop | 115 | 63 | 39 | 30 | 0 |
| mobile | 119 | 65 | 43 | 20 | 0 |

Inventory IDs: 247. Manifest rows considered: 1305.

## 6. Coverage — empty state

The same inventory captured on a brand-new tenant (the ministry and two users, nothing else). "— no object to open" means the screen is a drill into an object a new ministry doesn't have yet (an event spoke, a receipt detail, a member sheet beyond the two founders); the populated run reached it, and on the empty tenant its absence *is* the empty state. Skip reasons are the rig's and carry over from the populated run. The review of these captures is in Batch 10 §6.

## N1

| ID | desktop | mobile |
|---|---|---|
| N1.1 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |
| N1.2 | ✓ 1 shot (visitor) | ✓ 2 shots (visitor) |
| N1.2.1 | SKIPPED — No-account-for-provider error needs an OAuth round trip; reviewed from code. | SKIPPED — No-account-for-provider error needs an OAuth round trip; reviewed from code. |
| N1.3 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |
| N1.3.1 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |
| N1.3.2 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |
| N1.3.3 | SKIPPED — Verify-code step needs a real OTP email; reviewed from code. | SKIPPED — Verify-code step needs a real OTP email; reviewed from code. |
| N1.4 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |
| N1.5 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |
| N1.6 | ✓ 1 shot (member) | ✓ 1 shot (member) |
| N1.7 | ✓ 2 shots (visitor, member) | ✓ 2 shots (visitor, member) |
| N1.7.1 | ✓ 1 shot (member) | ✓ 1 shot (member) |
| N1.7.2 | SKIPPED — Duplicate-account dialog needs a second account with the same name; reviewed from code. | SKIPPED — Duplicate-account dialog needs a second account with the same name; reviewed from code. |
| N1.7.3 | SKIPPED — Post-join pickers fire once after a join; reviewed from code. | SKIPPED — Post-join pickers fire once after a join; reviewed from code. |
| N1.7.4 | SKIPPED — Staff role picker fires on a staff-code join; reviewed from code. | SKIPPED — Staff role picker fires on a staff-code join; reviewed from code. |
| N1.7.5 | SKIPPED — Same InviteShareModal as N2.11. | SKIPPED — Same InviteShareModal as N2.11. |
| N1.8 | ✓ 2 shots (visitor, member) | ✓ 2 shots (visitor, member) |
| N1.8.1 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |
| N1.9 | ✓ 2 shots (visitor, member) | ✓ 2 shots (visitor, member) |
| N1.10 | ↳ in N1.10.1 | ↳ in N1.10.1 |
| N1.10.1 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N1.10.2 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N1.10.3 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N1.10.4 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N1.11 | SKIPPED — Pending page needs a ministry in 'pending' status; neither sandbox is. Reviewed from code. | SKIPPED — Pending page needs a ministry in 'pending' status; neither sandbox is. Reviewed from code. |
| N1.12 | ✓ 1 shot (member) | ✓ 1 shot (member) |
| N1.13 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |
| N1.14 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |
| N1.15 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |
| N1.16 | ✓ 1 shot (visitor) | ✓ 1 shot (visitor) |

### N2

| ID | desktop | mobile |
|---|---|---|
| N2.1 | ↳ in N2.3 | n/a |
| N2.1.1 | ✓ 1 shot (admin) | n/a |
| N2.1.2 | SKIPPED — Workspace nav-hint bubble is a one-time transient (profiles.seen_workspace_nav_hint); reviewed from code (desktop-nav.tsx). | n/a |
| N2.1.3 | ↳ in N2.3 | n/a |
| N2.2 | n/a | ↳ in N2.4 |
| N2.3 | ✓ 5 shots (admin, pastor, leader, member, visitor) | n/a |
| N2.3.1 | ↳ in N2.3 | n/a |
| N2.3.2 | ↳ in N2.3 | n/a |
| N2.3.3 | ↳ in N2.3 | n/a |
| N2.3.4 | ↳ in N2.3 | n/a |
| N2.3.5 | ↳ in N2.3 | n/a |
| N2.3.6 | ↳ in N2.3 | n/a |
| N2.4 | n/a | ✓ 5 shots (admin, pastor, leader, member, visitor) |
| N2.4.1 | n/a | ↳ in N2.4 |
| N2.4.2 | n/a | ↳ in N2.4 |
| N2.4.3 | n/a | ↳ in N2.4 |
| N2.4.4 | n/a | ↳ in N2.4 |
| N2.4.5 | n/a | ↳ in N2.4 |
| N2.4.6 | n/a | ↳ in N2.4 |
| N2.4.7 | n/a | ↳ in N2.4 |
| N2.4.8 | n/a | ↳ in N2.4 |
| N2.4.9 | n/a | ↳ in N2.4 |
| N2.5 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N2.6 | ✓ 2 shots (admin) | n/a |
| N2.7 | ↳ in N5.4 | — no object to open |
| N2.8 | n/a | ✓ 1 shot (admin) |
| N2.9 | SKIPPED — Super switcher is gated on the founder UUID; no test login can render it. Review from code + Brian's own screen. | SKIPPED — Super switcher is gated on the founder UUID; no test login can render it. Review from code + Brian's own screen. |
| N2.10 | SKIPPED — Desktop member-actions kebab did not open under the rig; the report modal is captured on mobile (N2.10) and the menu reviewed from code (member-sheet.tsx MemberActionsMenu). | n/a |
| N2.11 | — no object to open | ✓ 1 shot (admin) |
| N2.12 | SKIPPED — no small chat for banner | SKIPPED — no small chat for banner |
| N2.13 | ✓ 1 shot (member) | ✓ 1 shot (member) |
| N2.14 | SKIPPED — Pending veil / pull-to-refresh are transient gesture states; reviewed from code. | SKIPPED — Pending veil / pull-to-refresh are transient gesture states; reviewed from code. |

### N3

| ID | desktop | mobile |
|---|---|---|
| N3.1 | ✓ 3 shots (admin, member) | n/a |
| N3.2 | n/a | ✓ 2 shots (admin, member) |
| N3.3 | ↳ in N3.1 | ↳ in N3.2 |
| N3.4 | ✓ 2 shots (admin) | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N3.5 | SKIPPED — no ack announcement | SKIPPED — no ack announcement |
| N3.5.1 | SKIPPED — no ack announcement | SKIPPED — no ack announcement |
| N3.6 | SKIPPED — /announcements/<id> is a redirect stub to the tab — nothing renders. | SKIPPED — /announcements/<id> is a redirect stub to the tab — nothing renders. |
| N3.7 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N3.8 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N3.9 | SKIPPED — no form announcement | SKIPPED — no form announcement |
| N3.10 | SKIPPED — no retreat form | SKIPPED — no retreat form |

### N4

| ID | desktop | mobile |
|---|---|---|
| N4.1 | n/a | ✓ 2 shots (admin, member) |
| N4.1.1 | ↳ in N4.2 | ↳ in N4.1 |
| N4.1.2 | SKIPPED — locator.click: Timeout 8000ms exceeded. | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N4.1.3 | n/a | — no object to open |
| N4.2 | ✓ 2 shots (admin, member) | n/a |
| N4.3 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N4.4 | ✓ 2 shots (admin) | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.5 | ✓ 1 shot (admin) | SKIPPED — locator.click: Timeout 6000ms exceeded. |
| N4.6 | ✓ 4 shots (admin, member) | ✓ 4 shots (admin, member) |
| N4.6.1 | ↳ in N4.6 | ↳ in N4.6 |
| N4.6.2 | ↳ in N4.6 | ↳ in N4.6 |
| N4.6.3 | ↳ in N4.6 | ↳ in N4.6 |
| N4.6.4 | — no object to open | — no object to open |
| N4.6.5 | SKIPPED — locator.boundingBox: Timeout 8000ms exceeded. | SKIPPED — locator.boundingBox: Timeout 8000ms exceeded. |
| N4.6.6 | ✓ 1 shot (admin) | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.6.7 | SKIPPED — locator.scrollIntoViewIfNeeded: Timeout 8000ms exceeded. | SKIPPED — locator.scrollIntoViewIfNeeded: Timeout 8000ms exceeded. |
| N4.6.8 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.6.9 | SKIPPED — Forward sheet opens from the context menu; menu captured in N4.6.5. | SKIPPED — Forward sheet opens from the context menu; menu captured in N4.6.5. |
| N4.6.10 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.6.11 | ↳ in N4.6 | ↳ in N4.6 |
| N4.6.12 | ↳ in N4.6 | ↳ in N4.6 |
| N4.6.13 | SKIPPED — Invite card renders only after an in-chat invite is sent; reviewed from code. | SKIPPED — Invite card renders only after an in-chat invite is sent; reviewed from code. |
| N4.6.14 | ↳ in N4.6 | ↳ in N4.6 |
| N4.7 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.7.1 | — no object to open | — no object to open |
| N4.7.2 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.7.3 | — no object to open | SKIPPED — locator.click: Timeout 4000ms exceeded. |
| N4.7.4 | — no object to open | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.7.5 | — no object to open | — no object to open |
| N4.7.6 | — no object to open | — no object to open |
| N4.7.7 | — no object to open | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.7.8 | — no object to open | — no object to open |
| N4.7.9 | — no object to open | — no object to open |
| N4.7.10 | — no object to open | — no object to open |
| N4.7.11 | — no object to open | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N4.7.12 | — no object to open | n/a |
| N4.8 | SKIPPED — Calls: no media device headless; ring/overlay/video reviewed from code. | SKIPPED — Calls: no media device headless; ring/overlay/video reviewed from code. |
| N4.8.1 | SKIPPED — Calls need a LiveKit room + media device; the ring/overlay are reviewed from code and the in-thread call affordances in N4.6.1. | SKIPPED — Calls need a LiveKit room + media device; the ring/overlay are reviewed from code and the in-thread call affordances in N4.6.1. |
| N4.8.2 | SKIPPED — Incoming-call surface not reproducible headless. | SKIPPED — Incoming-call surface not reproducible headless. |
| N4.8.3 | SKIPPED — Video stage not reproducible headless. | SKIPPED — Video stage not reproducible headless. |
| N4.8.4 | SKIPPED — Video grid not reproducible headless. | SKIPPED — Video grid not reproducible headless. |
| N4.8.5 | SKIPPED — Screen share not reproducible headless. | SKIPPED — Screen share not reproducible headless. |
| N4.9 | n/a | SKIPPED — locator.click: Timeout 8000ms exceeded. |

### N5

| ID | desktop | mobile |
|---|---|---|
| N5.1 | ✓ 2 shots (admin, member) | n/a |
| N5.2 | n/a | ✓ 1 shot (admin) |
| N5.3 | ✓ 1 shot (member) | SKIPPED — no Sarah Kim |
| N5.3.1 | SKIPPED — Desktop member-actions kebab did not open under the rig; the report modal is captured on mobile (N2.10) and the menu reviewed from code (member-sheet.tsx MemberActionsMenu). | — no object to open |
| N5.3.2 | SKIPPED — Cannot read properties of null (reading 'id') | SKIPPED — Cannot read properties of null (reading 'id') |
| N5.4 | ✓ 2 shots (admin, member) | n/a |
| N5.5 | n/a | ✓ 1 shot (admin) |
| N5.5.1 | n/a | ✓ 1 shot (admin) |
| N5.5.2 | n/a | ✓ 1 shot (admin) |
| N5.5.3 | n/a | ✓ 1 shot (admin) |
| N5.5.4 | n/a | — no object to open |
| N5.6 | ↳ in N5.6.1 | — no object to open |
| N5.6.1 | ✓ 2 shots (admin) | — no object to open |
| N5.6.2 | ✓ 1 shot (admin) | — no object to open |
| N5.6.3 | ✓ 1 shot (admin) | — no object to open |
| N5.7 | SKIPPED — Class-change prompt fires on a graduation-year transition; reviewed from code. | SKIPPED — Class-change prompt fires on a graduation-year transition; reviewed from code. |
| N5.8 | ↳ in N5.8.1 | — no object to open |
| N5.8.1 | ✓ 1 shot (pastor) | — no object to open |
| N5.8.2 | ✓ 1 shot (pastor) | — no object to open |
| N5.8.3 | SKIPPED — Cannot read properties of null (reading 'id') | — no object to open |
| N5.9 | ✓ 2 shots (admin, member) | — no object to open |

### N6

| ID | desktop | mobile |
|---|---|---|
| N6.0 | n/a | ✓ 2 shots (admin, pastor) |
| N6.1 | ✓ 2 shots (admin, pastor) | ✓ 1 shot (admin) |
| N6.1.1 | ↳ in N6.1 | ↳ in N6.1 |
| N6.1.2 | ↳ in N6.1 | ↳ in N6.1 |
| N6.1.3 | ↳ in N6.1 | ↳ in N6.1 |
| N6.1.4 | ↳ in N6.1 | ↳ in N6.1 |
| N6.1.5 | ↳ in N6.1 | ↳ in N6.1 |
| N6.1.6 | ↳ in N6.1 | ↳ in N6.1 |
| N6.2 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N6.2.1 | ↳ in N6.2 | ↳ in N6.2 |
| N6.2.2 | ↳ in N6.2 | ↳ in N6.2 |
| N6.2.3 | SKIPPED — Role-change confirm: the row action menu did not open under the rig; reviewed from code (settings-tab.tsx:2775) and the People capture. | SKIPPED — Role-change confirm: the row action menu did not open under the rig; reviewed from code (settings-tab.tsx:2775) and the People capture. |
| N6.2.4 | SKIPPED — Excommunicate is destructive; not exercised. Reviewed from code + the row menu shot. | SKIPPED — Excommunicate is destructive; not exercised. Reviewed from code + the row menu shot. |
| N6.3 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N6.3.1 | ↳ in N6.3 | ↳ in N6.3 |
| N6.3.2 | ↳ in N6.3 | ↳ in N6.3 |
| N6.4 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N6.5 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N6.6 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N6.7 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N6.7.1 | ↳ in N6.7 | ↳ in N6.7 |
| N6.7.2 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N6.7.3 | ↳ in N6.7 | ↳ in N6.7 |
| N6.7.4 | ↳ in N6.7 | ↳ in N6.7 |
| N6.7.5 | ↳ in N6.7 | ↳ in N6.7 |
| N6.7.6 | ↳ in N6.7 | ↳ in N6.7 |
| N6.7.7 | ↳ in N6.7 | ↳ in N6.7 |
| N6.8 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N6.9 | ✓ 1 shot (admin) | ↳ in N6.1 |

### N7

| ID | desktop | mobile |
|---|---|---|
| N7.0 | ✓ 2 shots (member) | ✓ 2 shots (member) |
| N7.1 | ✓ 2 shots (admin, member) | ✓ 2 shots (admin, member) |
| N7.1.1 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 6000ms exceeded. |
| N7.1.2 | ↳ in N7.2 | n/a |
| N7.2 | ✓ 2 shots (admin, member) | ✓ 2 shots (admin, member) |
| N7.2.1 | n/a | ↳ in N7.2 |
| N7.2.2 | ✓ 1 shot (admin) | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.2.3 | ✓ 1 shot (admin) | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.2.4 | ✓ 1 shot (admin) | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.2.5 | ✓ 1 shot (admin) | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.2.6 | ✓ 1 shot (admin) | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.2.7 | ✓ 1 shot (admin) | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.2.8 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.3 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.3.1 | — no object to open | — no object to open |
| N7.3.2 | — no object to open | — no object to open |
| N7.3.3 | — no object to open | — no object to open |
| N7.3.4 | ↳ in N8.1 | ↳ in N8.1 |
| N7.3.5 | SKIPPED — Add-sub-event is the same modal as N7.3 with a parent set; the container it feeds is captured (N8.5). | SKIPPED — Add-sub-event is the same modal as N7.3 with a parent set; the container it feeds is captured (N8.5). |
| N7.4 | ✓ 2 shots (admin, member) | ✓ 2 shots (admin, member) |
| N7.4.1 | n/a | ↳ in N7.4 |
| N7.4.2 | ✓ 2 shots (admin, member) | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.4.3 | ↳ in N7.4.2 | — no object to open |
| N7.4.4 | ↳ in N7.4.2 | — no object to open |
| N7.4.5 | ↳ in N7.4.2 | — no object to open |
| N7.4.6 | ✓ 1 shot (admin) | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.4.7 | ↳ in N7.4.6 | — no object to open |
| N7.4.8 | ✓ 2 shots (admin, member) | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.4.9 | — no object to open | — no object to open |
| N7.5 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N7.5.1 | ↳ in N7.5 | n/a |
| N7.5.2 | SKIPPED — locator.click: Timeout 5000ms exceeded. | n/a |
| N7.5.3 | n/a | SKIPPED — locator.click: Timeout 6000ms exceeded. |
| N7.5.4 | n/a | — no object to open |
| N7.6 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 6000ms exceeded. |
| N7.6.1 | — no object to open | — no object to open |
| N7.6.2 | — no object to open | — no object to open |
| N7.6.3 | — no object to open | — no object to open |
| N7.7 | ↳ in N7.2.6 | ↳ in N7.2.6 |
| N7.7.1 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.8 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.8.1 | — no object to open | — no object to open |
| N7.8.2 | — no object to open | — no object to open |
| N7.8.3 | — no object to open | SKIPPED — Group-generator preview step: the Generate press timed out on the phone run; reviewed from the desktop capture. |
| N7.8.4 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 8000ms exceeded. |
| N7.9 | — no object to open | — no object to open |
| N7.9.1 | ✓ 1 shot (admin) | n/a |
| N7.9.2 | n/a | ✓ 1 shot (admin) |
| N7.9.3 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |
| N7.9.4 | — no object to open | — no object to open |
| N7.9.5 | SKIPPED — Delete-category confirm is destructive on seeded categories; reviewed from code + the ConfirmDialog pattern shot (N6.1.3). | SKIPPED — Delete-category confirm is destructive on seeded categories; reviewed from code + the ConfirmDialog pattern shot (N6.1.3). |

### N8

| ID | desktop | mobile |
|---|---|---|
| N8.0 | n/a | — no object to open |
| N8.1 | SKIPPED — locator.click: Timeout 8000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N8.2 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N8.2.1 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N8.3 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 6000ms exceeded. |
| N8.4 | — no object to open | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N8.4.1 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N8.5 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 6000ms exceeded. |
| N8.6 | — no object to open | — no object to open |
| N8.6.1 | — no object to open | — no object to open |
| N8.6.2 | — no object to open | — no object to open |
| N8.6.3 | — no object to open | — no object to open |
| N8.7 | — no object to open | — no object to open |
| N8.8 | — no object to open | — no object to open |
| N8.9 | — no object to open | — no object to open |
| N8.10 | SKIPPED — Gov-view read-only mat needs a governance admin who is NOT a team member; captured in the empty-state lane instead if reachable. | SKIPPED — Gov-view read-only mat needs a governance admin who is NOT a team member; captured in the empty-state lane instead if reachable. |
| N8.11 | — no object to open | — no object to open |
| N8.12 | — no object to open | — no object to open |

### N9

| ID | desktop | mobile |
|---|---|---|
| N9.0 | n/a | — no object to open |
| N9.1 | — no object to open | — no object to open |
| N9.2 | — no object to open | — no object to open |
| N9.3 | — no object to open | — no object to open |
| N9.3.1 | SKIPPED — locator.click: Timeout 6000ms exceeded. | SKIPPED — locator.click: Timeout 6000ms exceeded. |
| N9.3.2 | — no object to open | — no object to open |
| N9.3.3 | SKIPPED — Decline dialog: the Decline control was not reachable in the detail capture; reviewed from code (finance-workspace.tsx ~806-828). | SKIPPED — Decline dialog: the Decline control was not reachable in the detail capture; reviewed from code (finance-workspace.tsx ~806-828). |
| N9.3.4 | SKIPPED — Undo toast appears only after an approve; approve is a real write — not exercised. | SKIPPED — Undo toast appears only after an approve; approve is a real write — not exercised. |
| N9.4 | SKIPPED — locator.click: Timeout 5000ms exceeded. | SKIPPED — locator.click: Timeout 5000ms exceeded. |
| N9.5 | — no object to open | — no object to open |

### N10

| ID | desktop | mobile |
|---|---|---|
| N10.1 | SKIPPED — /admin is gated on the founder's email in proxy.ts; no test login can open it. Reviewed from code. | SKIPPED — /admin is gated on the founder's email in proxy.ts; no test login can open it. Reviewed from code. |
| N10.2 | ✓ 1 shot (admin) | ✓ 1 shot (admin) |

### Totals

| viewport | captured | covered | skipped | n/a | no object | missing |
|---|---|---|---|---|---|---|
| desktop | 73 | 44 | 60 | 30 | 40 | 0 |
| mobile | 56 | 40 | 77 | 22 | 52 | 0 |

Inventory IDs: 247. Manifest rows considered: 748.
