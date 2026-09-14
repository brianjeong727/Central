# Design pass · Batch 6 — Messages (N4)

Reviewed 2026-09-14 against the seeded E2E Sandbox, both widths, as admin and member, in a 32-member church chat, a personal chat and a DM. 27 captures, 3 reviewers (desktop, mobile, information architecture). Calls could not be captured (no media device headless) and are reviewed from code. The mobile chat-settings subpage and its drills did not open for the rig — for the reason in the first finding below — and are reviewed from code plus the desktop settings capture.

---

## The short version

Messages is the most finished-feeling surface in Central and the one a member will touch every day. The thread is genuinely good — one cream ground, ivory bubbles with no borders, plum only on your own words, reply quotes that read as quotes, reactions where your eye already is, swipe-to-reply — and against a group text it wins on the three things a ministry actually needs: rooms that already exist for the right people, a pinned message everyone sees, reactions that don't spam the thread. It feels like a place you'd rather talk than in iMessage, which is the whole bet.

The breaks are all at the thread's edges:

- **Acting on a room is undiscoverable on a phone.** Chat settings — members, mute, notifications, media, add people, rename, leave — opens from a bare tap on the chat's *name*, with no chevron, no gear, no member count (both are desktop-only). A student in a 32-person church chat has no way to see who's in the room without guessing the title is a button. My own capture rig failed to find it three times. On desktop the same settings hide behind a bare person-glyph that reads as "see who's here".
- **The composer footer makes a privacy claim Central can't back.** Every chat reads "End-to-end visible to {chat} members" — end-to-end is an encryption promise, messages sit in plaintext and are read by moderation and admins, and on a DM it degrades to "…E2E Member members".
- **Search doesn't search messages.** Searching "retreat" returns "No matches · Try a different name" while four messages on screen use the word — the panel search covers chat names and people only, and the empty state blames the user. The most-used verb in a messaging product is missing.
- **The long-press menu has no Copy.** Reply, Forward, Report, Pin. Copying a door code, a Venmo handle or an address is the most common thing anyone does with a message.
- **A plain member can create a church chat** — because the gate is a regex over *team names* ("board", "small group", "leadership"…). This member is on "Student Org Board", so they match; a team called "Board games night" would confer ministry-wide chat creation. `permissions.md` says Member = ✗.

And the conversation list on desktop is built at a different, much smaller type scale than anything else in the product — 13px names, 11.5px previews, 9.5px times, 8.5px avatar initials, 6px read-receipt initials — while the thread you're actually in is titled at 16px, *smaller* than the word "Messages" above the list. The index shouts quietly and the content whispers.

**Recommendation:** give the phone header a visible disclosure — name plus a faint chevron and the member count restored as a sub-line (iMessage/GroupMe grammar; it also fills the empty second line) — and make the desktop control the gear. Rewrite the footer to say who can actually read this ("Visible to everyone in Tuesday Night DG"). Either search message bodies or rename the box "Find a chat or person" and fix the empty state. Add Copy. Move church-chat creation to a real permission. Re-cut the desktop panel on the real type scale in one pass.

---

## 1. What a person hits

- **Three scopes, three create grammars:** Church = a ghost "+" per section; Mine = a plum circle in the chrome (and on desktop, also a permanently-pinned dashed "New message" card — two homes for one verb); Open = no create and no search. In Open, "Join" is 11px faint row meta two letters away from "Joined" — the discovery surface never looks like it has an action on it.
- **The "DIRECT · 5" rule** heads a list where three of five rows are group chats.
- **Unread is signalled three times** — a dot, a darker preview, and the name jumping to weight 600 — and in two colours across the shell (a gold dot on the rail, plum on the rows).
- **A two-person DM prints the other person's name above every incoming bubble** — four times on one screen — and a short thread top-aligns, leaving ~400px of cream between the last message and the composer.
- **The quick-reaction bar (tap) drops in-flow with no scrim, on top of the *next* message** — you'll thumb a 🙏 onto the wrong person's prayer request — while the long-press lifts the bubble over a scrim. Two ways of reacting, two materials.
- **The reactor tooltip lands on top of the message** it belongs to.
- **The pinned-message banner** is the only opaque band on the chat screen; the transcript scrolls under it with a hard edge, slicing a message in half.
- **Small-room read receipts are 16px chips with 6px initials** — a speck floating above the composer.
- **The in-flow separator is serif italic ALL-CAPS** ("TODAY · 5:26 PM") and fires on a time gap, so one afternoon shows TODAY twice.
- **The header for a 32-member room prints eight arbitrary first names**, truncated by width.
- **Compact sidebar removes the conversation list entirely** — a thread with no way to switch.
- **Collapsing the rail on desktop, and the mobile chat screen sits on a 16px gutter** while the list it came from sits on 20.

## 2. Design-system findings — by root pattern

- **The desktop panel's half-pixel, sub-floor type scale** (12.5 / 13.5 / 11.5 / 9.5 / 8.5 / 6) — one root fix, not nine; take the avatar-stack and read-receipt chips out of the text business entirely.
- **`--line-2` used as a fill in seven chat surfaces** (the emoji bar's "+", reply quotes, the file chip, @mention highlight, composer chip, two hovers) — the contract names `--pocket-track`; one substitution repeated.
- **A reaction pill you added is a solid plum fill** with a 2px cream ring — plum is never a fill; hairlines are 1px.
- **The desktop message menu blurs the whole app** to show four items — right on a phone, an error-modal read with a mouse.
- **The mobile chrome title's unread dot** sits equidistant between two scope labels.
- **The file-attachment card renders the same download glyph twice.**
- **The message context menu mounts at z 170 over a blurred scrim** — a z-value and a material in neither the Z-index table nor the mobile doc.

## 3. Rules to add or change

**Change (code is right, doc moves):** `--ivory` has replaced cream + hairline as chat's inset surface on six surfaces — bubble, composer pill, quick-reaction bar, reaction pill, "Seen by", poll card — and reads better; update §4.15/4.16. The member-derived avatar cluster superseded "every chat is the same plum monogram" one day after that line was ratified; rewrite §5, including the sub-10px initials it necessarily uses. The mobile token table (again).

**New:** the reaction chip inverts against its bubble and fills plum when you're among the reactors — a genuinely good rule that looks like drift until you know the axis is participation, not sender. The master/detail panel row has four implementations and no component (`PanelRow`). The lifted-message material and z 170 need a line.

## 3b. Messages as a system

The rooms are organised on two axes that don't nest. The top level splits by **who made the room** (church vs mine vs open); the second by **what it's for** (general / groups / teams). So a DG lands in Church → Groups or in Mine depending on whether the automation or a person created it; an event's planning room lands in Church → *Teams* or in Mine; and a class chat is silently moved from Church to Mine by a June cron. Neither axis answers the question a sophomore arrives with — "where do I ask about Friday?" — and the answer she learns can expire.

Three structural findings on top of the screen-level ones:

- **The code path that created a room decides its feature set.** A hand-made DG chat has nicknames, member management and Leave; the auto-created chat for the identical room has none of the three. The rational move for a DGL who notices is to abandon the automation.
- **The church-chat create gate is a different predicate in each direction.** The UI grants it via the team-name regex; the server grants it to leader-tier alone. A member on "Student Org Board" is offered a button that fails; a leader with no team is denied a permission the doc gives them.
- **Planning already lives in Messages and the planning system can't see it.** The captured DM assigns a run-of-show block and a reimbursement in plain prose, and the ministry's own retreat room is a hand-made personal chat sitting beside "Board games night" — not the roster-synced planning room the product builds. Central's central bet is losing to the path of least resistance inside its own app.

The IA reviewer's recommendation, which I share: fix what the three scopes *claim* first — rename Mine's "DIRECT" header, badge open rooms inside Mine instead of double-homing them in a third scope, render empty section headers so their create exists when it's most needed, give planning rooms an **Events** section so they stop being filed under Teams — and make the real answer (sections by purpose across every chat type, ownership demoted to a permission and a row badge) cheaper to build later.

## 4. Decisions that are yours

1. **Message search:** (a) full-text over message bodies — the biggest daily win, needs an index; (b) keep names-only, relabel "Find a chat or person", fix the empty state; (c) leave. Today it's (c) wearing (b)'s clothes.
2. **Church-chat creation:** (a) leader-tier + an explicit team permission, keep the doc; (b) keep team-based creation and rewrite the permissions row. Recommendation: (a).
3. **Chat settings on a phone:** (a) name + faint chevron + member count sub-line; (b) an explicit round action in the chrome row, which costs the "no chrome actions on the chat header" line in the doc.
4. **Compact sidebar in Messages:** (a) exempt Messages from the collapse; (b) a narrow avatar-only thread strip when compact; (c) accept it.
5. **The immersive message menu on desktop:** keep the blur takeover at every width, or an anchored popover at `md:` and up?
6. **DM name labels:** suppress the sender name and repeated avatar in a two-person DM (iMessage / WhatsApp / Signal), or keep for consistency with groups?
7. **Scopes:** (a) keep Church / Mine / Open and fix their claims; (b) sections by purpose (Ministry · My groups · Direct · Events) with ownership as a badge; (c) recency-first with pinned sections.
8. **Auto-created rooms:** should an auto-created DG chat carry the same capabilities (nicknames, members, leave) as a hand-made one?

## 5. How to look yourself

On your phone as the sandbox member: Chats → E2E Sandbox Chat — now find out who's in it. Long-press a message and look for Copy. Search "retreat". Then as admin on desktop: read the composer footer in a DM; collapse the rail.
