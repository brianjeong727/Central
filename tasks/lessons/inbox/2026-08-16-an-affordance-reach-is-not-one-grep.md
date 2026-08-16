## An affordance's REACH is a call-site census, not one grep (2026-08-16)

Asked whether Profile deserved a mobile pill tab, I grepped `onAvatarClick` across
`home-tab.tsx`, `pocket-header.tsx` and `home-app.tsx`, found one hit, and told Brian
"Profile has exactly one door on mobile, and it's on one screen." I then called that
the decisive argument for the change.

It was wrong. The avatar was on **all four tab roots** — Home via `PocketHeader`, plus
`chat-list-view.tsx`, `announcements-tab.tsx` and `plan-tab.tsx` each passing
`onAvatarClick={onGoToProfile}` to `PocketChrome` — and on four `MobilePocketHub`
workspace hubs besides. Eight call sites. My grep had been scoped to three files I
had already opened, so it could only ever confirm what I had already seen.

The specific trap: I was grepping for the HANDLER name in files I'd read, when the
question was "where does this component get RENDERED." Those are different queries.
A prop only tells you the contract; the census is `grep -rn '<ComponentName'` across
`app/` + `components/`, then reading each hit for whether the feature is on or off
there (`hideAvatar` was the opt-out, so hit-count alone still lies).

Why it mattered beyond being embarrassing: the false premise was load-bearing for a
product decision. Brian had reasons of his own, but I supplied the argument he was
weighing, and "the gap I claimed" did not exist — the real state was a consistently
shipped pattern, which makes the change a redundancy question instead of a gap-filling
one. Caught only when I opened the call sites to edit them, i.e. after he'd decided.

**Rule:** before asserting an affordance's reach — "X is reachable only from Y", "this
is the only place that does Z" — run the census over the whole tree, not the files
already in context, and query for the RENDER site, not the handler. If the census
can't be run cheaply, say "one door that I found" rather than "one door". And when a
premise you supplied turns out false, surface it before building on it — a decision
made on your bad fact is your error to raise, not the user's to discover.

Related: [[the-shipped-artifact-embeds-the-config-not-reads-it]] (same family — asserting
what the system does from a partial reading of what the source says).
