## A scope switcher must say which scope is holding your unread (2026-08-24)

Brian: "there are 2 places the message could be from, church or mine — if you get a
notification but go to messages and don't see it there should be a badge on the Mine
tab to indicate you're looking at the wrong tab."

**The failure this fixes is a trust failure, not a missing feature.** The nav badge
says 1. You open Messages, land on Church (the default scope), and the list is empty.
Nothing is broken and nothing is lying, but the app has told you a message exists and
then shown you a screen without it. The user's conclusion is "this thing loses
messages", which is much more expensive than the missing dot.

**Generalise: any control that HIDES buckets owes an indicator on the buckets it
hides.** Filters, scopes, segmented controls, collapsed sections. The moment a count
somewhere else refers to a superset of what is on screen, the control has to account
for the difference. Worth checking wherever a badge and a filter coexist.

**The contract is PARTITION, not presence.** The scope dots must account for exactly
the unread the bottom-nav badge counts — same `!archived && !muted` filter, from one
shared helper (`unreadByScope`, chat-shared.ts). If the nav says 3 and the scopes
account for 2, the feature has replaced "where is it?" with "where are the other
ones?", which is worse than no indicator. The test asserts the dot is ABSENT on the
empty scope and on a muted chat for the same reason — an indicator that is always on
is not an indicator.

**Two viewports, two different components, one feature.** Desktop renders
`SegmentedControl`; phone width renders the three scopes AS the `PocketChrome` title
(the scope IS the title — mobile_design_system §3). The first pass only reached
desktop and the screenshot at 390 looked identical to before. **The viewport that
receives the push is the phone**, so a desktop-only assertion would have shipped the
feature to the width that needs it least. Both are asserted now, in one spec, via a
`role=radio` OR `role=tab` locator.

**Neither shared component needed a breaking change.** `SegmentedControl.label` was
already `ReactNode`, so the dot rides the label and no other segmented control in the
app is touched. `PocketChrome` gained an OPTIONAL `dot?: boolean` per scope option —
every other caller passes nothing and is unaffected. Check the primitive's existing
API before widening it; half the time the seam is already there.

**Convention #27 watch-out that held.** Adding a node inside the chrome row risks the
screen sweep latching onto it as a title (it did exactly that with a chat avatar's
initials once). The dot carries no text and is `aria-hidden` with a real ", unread"
for screen readers, so the sweep still finds one leaf title per row: 52 screens, 0
violations. The row's measured width budget also survives — Church + Mine + Open is
211px of 247 at 375px wide, and two dots cost 24.

**Test-order trap.** All four tests share one seeded room and each MUTATES it: reading
it clears the unread, muting it silences it. The suite passed, then failed, then
passed depending on order. Every test now arranges its own starting state
(`makeUnread()`). Also: the desktop panel AUTO-OPENS the most recent conversation when
the URL carries no chat — which read the seeded message out from under the assertion.
Desktop tests now land inside a church chat explicitly.
