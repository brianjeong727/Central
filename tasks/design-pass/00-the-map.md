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

## 5. Coverage

_(appended when the capture manifest is final — every inventory ID × viewport, captured / covered / SKIPPED with reason.)_
