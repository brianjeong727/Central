# Inline acknowledgment on the feed card — build report

Branch `spec/announcement-acknowledgment`, on top of `4633afb`. **Not committed.**
`npx tsc --noEmit` clean · `npx eslint` on both touched files: **0 errors** (4 warnings, all
pre-existing dead imports in this file).

## What shipped

An acknowledgment control in the feed card's existing action cluster, on **three surfaces** —
the desktop editorial card, the desktop pinned hero, and the mobile Pocket card — with three
mutually exclusive states:

| Card state | Control |
|---|---|
| body **fully visible**, not acknowledged | **"Got it"** — desktop: `CentralButton variant="plum-outline"` at the sibling RSVP pill's exact geometry (`8px 16px`, r999, 12px). Mobile: `PocketButton variant="quiet" surface="card"` (cream fill, plum text) at the sibling RSVP pill's `minHeight 38 / padding 0 20`. |
| body **clipped** | **"Read & confirm →"**, which opens the announcement via the existing `onOpenAnnouncement` / `onOpenDetail`. Desktop: ghost text at 12px muted→plum, matching the "See announcement →" grammar already in the card. Mobile: 13/600 plum text. |
| already acknowledged | muted `✓ Acknowledged` — same quiet confirmed grammar as the detail view. Never a re-ask, never an undo. |

Only when `requires_ack` is true; never on a draft; never for the **author** (they are outside
the recipient set in the denominator, the roster and the push — a card that asked them would be
the one place the UI disagreed with the count beside it).

**Neither viewport got a plum FILL.** The plum-filled pill on a feed is RSVP's; a feed is ten
cards, and a filled pill per card spends the one surgical accent ten times down a screen
(contract-card §north star; mobile §6 "one plum-filled create per screen"). Quiet/outline at
the identical pill geometry keeps the cluster's rhythm without adding a second loud tier.

## Truncation is measured, never guessed

New local `ClampedText` renders the clamped `<p>` and reports `scrollHeight - clientHeight > 1`
— the browser's own answer, so it needs no knowledge of the clamp count or the font. Re-asked
on every reflow via `ResizeObserver`, **and** after `document.fonts.ready`: a webfont swap
changes the text's natural height without changing the clamped box, so the observer alone
sleeps through it. 1px tolerance absorbs sub-pixel line-height rounding.

- **Unmeasured defaults to CLIPPED** at every read site (`?? true` on desktop, `useState(!!body)`
  on mobile). During first paint the honest assumption is that the body is cut off — a card must
  never offer an inline confirm it has not yet earned. The one exception: an announcement with
  **no body** has nothing to clip and nothing to read, so it starts honest.
- Desktop cards are inline JSX inside a `.map()`, so a hook per card is not available; they
  report up into one `clippedIds` map on the tab (`reportClipped`, identity-stable via
  `useCallback`, no-ops when the value is unchanged). The mobile card is a real component and
  owns its own state. Same primitive, both viewports.
- `ClampedText` keeps the callback in a ref updated **in an effect**, not during render
  (`react-hooks/refs` — a render-phase ref write is unsafe under concurrent rendering).

## One write path, not two

`handleAcknowledge` calls the same `acknowledgeAnnouncement()` (`lib/announcement-ack.ts`) the
detail view uses — `ignoreDuplicates: true` → `ON CONFLICT DO NOTHING`, empty result treated as
success. Optimistic SWR mutate with `rollbackOnError` (Convention #4). No second writer exists.

Three cache consequences handled:
- The feed loader now also reads **my own** ack rows (`.eq("user_id", …)`, own-row under RLS) to
  seed `user_has_acked`. **No ack COUNT is fetched for the feed** — the card shows no count, and
  per instruction none was added; the leader view stays on the announcement's own screen.
- `handleRsvpToggle`'s optimistic updater now also sets `user_has_acked` (one-way OR — un-RSVP
  never takes it back), so RSVPing settles the ack slot in the same frame as the RSVP pill.
- Acknowledging **from the detail view** now invalidates the `["announcements", …]` cache as well
  as `["home-tab", …]`, so returning to the feed cannot show "Got it" on a card you just
  acknowledged.

## Files touched

- `lib/announcement-audience.ts` — `announcementAsksAck()`, the one encoding of "is this person asked".
- `app/home/tabs/home-tab.tsx` — the Up Next hold and all three RSVP ack writes routed through it; `asksAckIds` on `HomeData`; slide announcement query widened.
- `app/home/tabs/announcements-tab.tsx` — `ClampedText`, `cardAsksAck`, `AckCardAction`,
  `clippedIds` + `reportClipped`, `handleAcknowledge`; wired into the pinned hero, the editorial
  card and `AnnouncementCard`; RSVP optimistic updater; detail-view cache invalidation.
- `app/home/types.ts` — `EnrichedAnnouncement.user_has_acked`, `AnnouncementCardProps.onAcknowledge`.

The detail-view "Got it" is untouched, as instructed.

## Follow-up pass — "the author is never asked, anywhere"

The reported bug was real and I had fixed only half of it: the feed card excluded the author,
the detail view did not, so an author could tap "Got it" on their own announcement and land in
a numerator that excludes them — **17 of 16**.

**Fixed by moving the question into one predicate**, `announcementAsksAck(ann, person)` in
`lib/announcement-audience.ts`, sitting directly on top of the `isAnnouncementRecipient` the
denominator already uses. The invariant it exists to hold is stated at the definition: **you
are asked if and only if you are counted.** No call site re-derives it.

It also closes the same hole one step further out, which the author case was only the loudest
instance of: **a leader's feed carries every audience**, including a class-only announcement
they are not in — and being asked to acknowledge a notice whose denominator excludes them is
the identical "17 of 16". That is why the predicate takes the viewer's graduation year and not
just their id, and why `AnnouncementCard` gained a `userGradYear` prop.

Consumers, all now one call:
- **Feed card** — `cardShowsAck()` (renamed from `cardAsksAck`) = `user_has_acked || announcementAsksAck(...)`. An already-acknowledged row still shows its quiet confirmed state even for someone no longer asked (a legacy row from before this tightening): reporting a fact is not making a request.
- **Detail view, both aside modules** — the ask is now gated on a new `asks_ack`, computed in the loader by asking whether the viewer is among *the very rows that produce the total*, so the two cannot disagree. The module itself still renders on `requires_ack`, so **the author keeps the leader view — "N of M acknowledged", the progress bar and the roster — and simply is not asked to confirm receipt of what they wrote.** That is exactly the requested end state.
- **Home's Up Next hold** — `heldByAck` now filters on the predicate. This was the same bug with the worse symptom you suspected: it was **not** handled, and an author's own announcement would have pinned itself to their Home permanently, with no control anywhere that could release it.

**Also swept: every path that WRITES an acknowledgment**, since an RSVP satisfies one. All five
RSVP writers now gate on the same predicate before writing the ack row (the RSVP itself is
untouched) — an author RSVPing their own event was silently entering the numerator by a second
route, with no UI involved at all:
- `announcements-tab` feed toggle (its optimistic `user_has_acked` flip is gated too, so the card cannot claim an acknowledgment that was never written) and the detail view's RSVP;
- `home-tab`'s hero, For-you and slide RSVPs, via an `asksAckIds` set computed once per load and carried on `HomeData`. The curated-slide announcement query gained `audience, created_by, requires_ack` — it selected too few columns to answer the question at all.
- `handleAcknowledge` and `acknowledgeAck` both guard as well, so the invariant lives at the write, not only at the control that renders it.

Server-side needed no change: the nudge action and the push resolver were already excluding the
author and filtering by audience scope.

## Judgement calls worth your eye

1. **The desktop compact/table view was deliberately left alone.** Its body is a single
   `white-space: nowrap` ellipsis — always clipped by construction — so the only honest control
   there is "open it", which the row already carries as `See →`. Adding a second one would put
   two identical-destination links in a 100px cell. A member in compact view acknowledges from
   the detail, exactly as before.
2. **The desktop editorial card's right cluster gained `flexWrap: "wrap"` + `justify-flex-end`.**
   An event card that also has a form and asks for acknowledgment now holds four controls in a
   half-width card; without wrapping they would have overflowed. This changes nothing for cards
   with fewer controls.
3. **`previewBody()` flattens newlines into spaces**, so "fully visible" means every WORD is on
   the card, with paragraph breaks lost. Judged honest enough to permit the inline tap —
   **confirmed by the coordinator, recorded here so the decision is recoverable.** If it is ever
   revisited, the fix is to measure against the raw body rather than the flattened preview.
4. **Two controls can now point at the same destination** on a clipped desktop card:
   "See announcement →" and "Read & confirm →". Kept deliberately — the neutral link does not
   carry the information that an acknowledgment is expected of you, which is the whole reason
   Brian asked for a card-level affordance.

## Not run

`npm run build` — my standing instructions reserve the full production build for the tester's
`verify.sh` pass. `tsc --noEmit` (the type gate the build performs) and eslint are both clean,
and nothing here crosses a server/client boundary: every new symbol lives inside the existing
`"use client"` file, and the only browser APIs (`ResizeObserver`, `document.fonts`) are read
inside an effect.
