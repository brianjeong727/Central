# CENTRAL — Product Vision & Roadmap

> **Scope:** This is a product vision and roadmap document. Implementation facts live in CLAUDE.md, design in DESIGN_SYSTEM.md, permissions in permissions.md, ministry workflows in MINISTRY_CONTEXT.md. Do not add schema, architecture, or convention detail here — it will drift. Point to the source instead.

---

## 1. Product Overview

**CENTRAL** is a multi-tenant church communication and ministry management platform built for college ministries. It is deployed at **joincentral.app**.

The name is intentional: CENTRAL is meant to be the single place where all ministry communication and planning happens, replacing group texts, scattered emails, and disconnected planning tools that most college ministries cobble together.

**The core problem:** College ministries are deeply relational but logistically fragmented. Leaders blast announcements via text. Members use different apps to chat. Praise teams coordinate over iMessage. Discipleship group leaders have no tools. No one has a single place to find out who someone is, how to pray for them, or what's coming up next.

**The platform vision:** Like Slack for churches — every ministry gets their own isolated workspace with their own members, chats, announcements, teams, and planning tools. A pastor registers their ministry in five minutes and invites their congregation. No IT required, no per-seat pricing negotiation, no setup overhead.

---

## 2. Who Uses It

CENTRAL serves four kinds of people inside a ministry, with access shaped by their role in the community — not arbitrary software tiers.

**Members and Visitors** are regular attendees and newcomers. They come to CENTRAL to stay in the loop: reading announcements, RSVPing to events, chatting with their small group, praying for each other. The experience should feel calm and focused — never overwhelming. Visitors are treated identically to Members in every functional way; the distinction is organizational (admins can tell at a glance who hasn't formally joined).

**Leaders** are the connective tissue: discipleship group leaders, student board members, praise team members. They need tools that let them do their ministry role without becoming app administrators. For them, CENTRAL unlocks announcement posting, team planning, and church chat management — without exposing the complexity of running the ministry itself.

**Admins** (pastors, deacons, elders) are responsible for the whole ministry. They use CENTRAL to manage membership, configure the workspace, track giving and budget, and have visibility into everything happening across teams. The admin experience adds power without cluttering the member-facing surfaces.

> **Full permissions breakdown:** see `permissions.md`.

---

## 3. Feature Intent

What each major feature area is *for* — the product reasoning behind it. Implementation details (schemas, routes, component names, exact UI behaviors) live in CLAUDE.md and the codebase.

### Announcements
Announcements replace the group text blast. They're the official voice of ministry leadership — used for event notices, weekly recaps, and call-to-action posts. RSVP lets members signal attendance with one tap, giving leaders a headcount without chasing replies. Audience targeting lets leaders send grade-year-specific posts without spamming everyone.

### Chats
Real-time messaging is the backbone of day-to-day ministry life. Two tiers exist by design: Church Chats (official, leader-created) and My Chats (member-created, informal). This mirrors how college ministries actually organize — a few canonical church-wide channels, plus a long tail of personal and small group conversations.

### Home Tab
The home screen is a personal ministry briefing — not a social feed. It shows what's next for you, what you've missed, and who you've been talking to. The goal is to give every member a reason to open the app daily without manufacturing engagement.

### Directory
The directory makes a ministry feel like a community rather than a mailing list. Members can find anyone in their congregation, see their spiritual profile, and start a conversation. For college ministries that grow quickly, it answers the perpetual question "who is that person?"

### Profile & Journal
The profile surfaces a member's verse, prayer request, and "pray for me this week" — fields that exist to encourage prayer and community. The journal (devotionals, prayers, saved verses) is private, giving members a place to document their spiritual life inside the same app they use to communicate with their church.

### Plan Tab
Ministry teams — praise team, discipleship group leaders, student organization board — need coordination tools beyond group chats. The Plan tab gives each team their own workspace: scheduling, role assignment, planning docs, and feature-specific tools (worship scheduling and availability for praise teams; group generation and rotation for DGL; event planning and task tracking for student boards). The goal is replacing ad-hoc iMessage and email coordination with tools that live inside the ministry's own platform.

### Giving Tab
College ministries run on small, regular contributions. The Giving tab makes it frictionless to know where and how to give (Zelle), and gives admins a place to track reimbursements and budget — without CENTRAL ever touching the money itself. It's an information and coordination layer, not a payment processor.

### Settings Tab
Admin-only. The control panel for the ministry workspace — member management, roles, invite codes, discovery settings, and ministry profile. The goal is making it possible for a non-technical pastor to fully manage their workspace without support.

### Forms Tab
Response collection tied directly to announcements. Rather than sending people to a Google Form, responses live inside the platform where admins can see them in context.

### Congregation Tab
Pastor-only. A pulse-check tool — posting questions to the congregation and seeing aggregated responses. Useful for gauging community sentiment and planning priorities without singling anyone out.

---

## 4. Vision & Principles

**What CENTRAL should feel like:** A calm, focused workspace built for ministry — not a generic SaaS tool, not a social feed.

**What it is not:**
- Not a general-purpose Slack clone
- Not a social media feed
- Not publicly accessible without an invite (ministries control membership)

**Design direction:** Warm-minimalist — cream surfaces, editorial serif, plum as a surgical accent. Full design contract lives in `DESIGN_SYSTEM.md`.

**Product principles:**

1. **Spiritual intentionality.** Prayer requests, Bible verses, and "pray for me this week" are first-class features — not profile vanity fields. The product exists to support spiritual community.

2. **Role-appropriate simplicity.** Members see a calm, focused app. Leaders see tools. Admins see controls. The UI reflects who you are in the community.

3. **Realtime first.** The app should never feel stale. Messages, announcements, and updates arrive immediately — not on refresh.

4. **Platform thinking.** Built for any college ministry anywhere, not just one church. Every decision that serves one ministry should serve all of them.

5. **Content over chrome.** Minimal decoration. The ministry's content — announcements, chats, worship sets — is the product. The app gets out of its own way.

---

## 5. Roadmap

### Completed
- Real-time messaging with reply threading, emoji reactions, read receipts, message editing, forwarding, file/image sharing, polls
- Announcements with RSVP, attendee visibility control, audience targeting (by grade year), image uploads, pinning
- Forms tab — announcement-linked response collection
- Member directory with spiritual profiles and DM creation
- Chat settings (rename, add/remove members, archive, delete, pin messages, @mentions)
- Multi-tenant architecture with invite-code join flow
- Teams and roles system — custom teams, team roles with granular permissions
- Plan tab
  - Praise Team: schedule, set builder, chord chart upload + viewer, availability system, lyric slide generator
  - DGL (Discipleship Group Leaders): rotation scheduling, availability, roster management
  - Small Groups: group generation algorithm, assignment tracking
  - Student Org Board: event planning, task and role tracking
- Bible study tools (shared sheets, progress tracking, annotations)
- Settings tab — member management, role assignment, discovery toggle, invite code, ministry profile
- Finance tab — reimbursements, budget tracking, fund allocation, giving info (Zelle)
- Congregation tab — pulse questions with aggregated responses (pastor-only)
- Profile tab — spiritual profile fields, journal (devotionals, prayers, verses)
- Home tab redesign — personal ministry briefing, Up Next card, congregation question prompt
- App shell — desktop three-column layout, mobile bottom nav, command palette
- Public ministry discovery and registration wizard
- Landing page (joincentral.app)

### Near-term
- Push notifications (Web Push API)
- PWA support (installable on mobile home screen)
- Google OAuth on mobile

### Mid-term
- Attendance tracking
- Analytics dashboard for admins (member growth, engagement, RSVP trends)
- Visitor onboarding flow improvements

### Long-term
- SongSelect integration for worship song import
- Multi-ministry user support (one person in multiple ministries simultaneously)
- Native mobile app (iOS/Android)
