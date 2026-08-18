# Spec — the announcement acknowledgment loop

**Status:** proposed, awaiting Brian's calls on the OPEN DECISIONS at the bottom.
**Why this exists:** announcements are the product claim — "you actually reach the
congregation." Today reach is invisible: a leader publishes and hears nothing back, and a
member's having-read is tracked passively (`announcement_views`) as analytics, not as a
signal anyone acts on. This loop turns reach into something both sides can see.

The rule that governs every decision below: **acknowledgment is what only the top rung
gets.** The notice tier (chat pin) and ordinary messages never ask for it. The moment a
notice asks for acknowledgment it has become an announcement and the ladder collapses.

---

## 1. Data model

### `announcement_acknowledgements` (new)
| column | type | notes |
|---|---|---|
| `announcement_id` | uuid FK → `announcements` | |
| `user_id` | uuid FK → `profiles` | |
| `acknowledged_at` | timestamptz default now() | |

`UNIQUE (announcement_id, user_id)`.

**No `ministry_id` column** — mirrors `rsvps`, which deliberately has none and is scoped
through its announcement. (This is the ONE sanctioned exception shape to Convention #8;
follow the `rsvps` precedent rather than inventing a third pattern.)

**Insert-only. Never deleted.** This is the key semantic difference from `rsvps`, which is
a toggle (Convention #10). You cannot un-see something. There is no un-acknowledge, and the
UI must never offer one — a reversible acknowledgment is not a signal, it is a preference.

### `announcements.requires_ack` (new column, boolean)
Whether this announcement asks for acknowledgment. Default per OPEN DECISION 1.

### Keep `announcement_views` exactly as it is
Passive open-tracking stays passive analytics. Do NOT conflate the two: a view means the
screen rendered, an acknowledgment means a person deliberately said "I've seen this." The
whole value is that the second one costs a tap.

---

## 2. The denominator — ONE shared helper, not re-derived

"142 of 180" is worthless if the 180 is computed differently in two places.

`app/api/push/dispatch/route.ts:resolveAnnouncement` already encodes the audience rule:
`null` / `"all"` / `"group"` → the whole ministry; a 4-digit string → only that
`graduation_year`. Extract that into one shared helper and have BOTH the push resolver and
the acknowledgment denominator consume it. Same reasoning as `lib/roles.ts` and `lib/tz.ts`:
a second copy is how two producers silently disagree.

The denominator **excludes the author** (the push resolver already skips them).

---

## 3. Member experience

- An announcement that `requires_ack` shows one primary action on its detail view:
  **"Got it"**. Plum primary, in the body, per web_design_system §3.2 / Convention #15.
- After the tap it becomes a quiet confirmed state ("Acknowledged"), muted, non-interactive.
  It never asks again and never offers to undo.
- **An RSVP satisfies acknowledgment.** RSVPing is a strictly stronger signal than "I saw
  this"; making someone tap twice for one announcement is the fastest way to teach them the
  tap is bureaucracy. Where both apply, RSVP writes the acknowledgment row too.
- Un-acknowledged announcements keep their place on Home (the existing Up Next / hero slot)
  until acknowledged, rather than scrolling away. Quiet, persistent, not modal.
- **Never a full-screen interstitial.** Ratified in conversation 2026-08-18: a dismissable
  takeover trains people to swipe past the exact thing we are elevating.

---

## 4. Leader experience

- On the announcement, leaders see **"142 of 180 acknowledged"** with a progress bar.
- Tapping the count opens the roster of who has NOT acknowledged (leader-tier only).
- One action: **"Remind the 38 who haven't."** A single tap that pings all of them.
  - Deliberately NOT per-person selection. Picking individuals turns a reach tool into
    micro-management, and it makes the leader responsible for who they singled out.
- **Nudge limit: at most 2 per announcement, at least 24h apart.** Enforced server-side via
  the existing `notification_ledger` claim-then-post idempotency pattern (same shape the
  Run Sheet tick uses), not client-side. Without a hard cap this becomes harassment and
  people mute the announcements channel permanently — which costs the whole product.
- Nudge copy is a reminder, never a reprimand. It is the same announcement, again.

---

## 5. Visibility and privacy

- The **aggregate count is visible to everyone.** It is what makes the norm legible —
  "people acknowledge announcements here" is learned by seeing that they do. Precedent:
  `announcements.show_attendees` already exposes RSVP identity by author choice.
- The **roster of who has not acknowledged is leader-tier only** (`isLeaderRole`).
  Never expose non-acknowledgers to members: that is shaming, and it is the failure mode
  that would make people resent the feature.
- RLS: a member may INSERT only their own row and SELECT only their own; leaders of the
  owning ministry may SELECT all rows for that ministry's announcements. The public count
  must come from a SECURITY DEFINER aggregate (pinned `search_path = public, pg_temp`),
  never from letting members read the table broadly.

---

## 6. Push

- New dispatch reason `announcement_nudge`, riding the existing `announcements` preference.
  Per the ratified taxonomy (2026-07-12) announcements are T1, always-on, official channel;
  a nudge is a re-send of a T1, not a new tier, so it needs no new pref.
- It must respect the same audience filter and the same author exclusion.

---

## 7. What would tell us this is working — or dead

- **Healthy:** acknowledgment rate climbs over the first minutes/hours and plateaus below
  100%; nudges are used occasionally; ack rate varies between announcements.
- **Dead signal:** near-100% acknowledgment within seconds, every time. That means people
  are tapping reflexively and the number has stopped carrying information. If that happens
  the fix is to ask LESS often (OPEN DECISION 1), not to make the button bigger.
- **Backfiring:** rising mute/disable rates on the `announcements` pref, or nudges hitting
  the cap regularly.

---

## RATIFIED — Brian, 2026-08-19

1. **`requires_ack` defaults to TRUE, with a per-announcement opt-out.** Every announcement
   asks unless the author turns it off. This is the norm-setting choice; the opt-out exists
   for purely informational posts so the tap does not go reflexive. Watch §7's dead signal —
   if ack rates pin at ~100% instantly, the response is to ask less often, never to make the
   button louder.
2. **The aggregate count is visible to EVERYONE.** Members see "142 of 180". Seeing that
   others acknowledge is how the expectation is learned. The roster of who has NOT
   acknowledged stays leader-tier only, always.
3. **An un-acknowledged announcement holds its place on Home** (the existing Up Next / hero
   slot) until acknowledged, and does nothing more. No badge, no interstitial, nothing that
   can be swiped away. Persistent but quiet.
