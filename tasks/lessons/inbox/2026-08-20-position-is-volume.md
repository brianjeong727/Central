## "Too loud" was three placements, not a styling problem (2026-08-20)

Brian: *"the open groups location on desktop and mobile is too loud."* The instinct is
to reach for the styling — but the desktop entry was already a 13.5px line with a
15px icon, about as quiet as an element gets, and it was still the loud one.

**The volume was POSITION.** Open groups appeared on three surfaces and was placed
FIRST on every one:

| surface | sat above |
|---|---|
| Home (mobile) | Up Next — the hero the whole page is built around |
| Chat sidebar (desktop) | the Church/My switcher, so above every conversation |
| Chat list (mobile) | the entire list |

A first-week discovery feature outranked the content each screen exists for, three
times. **Order is a claim about importance, and it is louder than type size.** No
amount of restyling fixes an element that is simply in front.

The second signal was DUPLICATION: a phone user met open groups twice before reading
anything, and the two entries disagreed about what it was — a card that joined
inline on Home, a row that navigated on Chats. Two grammars for one feature reads as
two features.

**The first fix was wrong, and the way it was wrong is the real lesson.** I demoted
it: the Home card became a quick tile near the bottom, and both chat entries moved
below the conversations. On desktop that worked — the sidebar entry became a PINNED
footer, outside the scroll region, always visible. On mobile I did the "same thing"
and moved it to the end of the list. It is not the same thing. **Mobile has no
pinned footer region, so "last" there means "below the fold forever"** the moment a
ministry has more than a screenful of chats. One principle, two surfaces, only one
of which could actually hold it — and I shipped both as if they were equivalent.
Brian caught it on the simulator in about a minute: *"moving it to the bottom makes
it basically undiscoverable."*

**What it should have been, and what it took to see it.** I kept proposing variants
of the same thing — a line, a quieter line, a line somewhere else — and Brian broke
the frame: *"it could be at the header level as a third option alongside church and
my chat."* That is right, and not a placement tweak. Church chats, my chats and open
groups are three genuine buckets of one object, so they belong in the exclusive
scope switch the screen already has. A scope costs the body zero pixels, never
scrolls away, and cannot outrank a list it is not above — it satisfies both
constraints at once, where every position in the body trades one for the other.

**Two things that fell out of it:**

- **It DELETED code.** Browse stopped being a push surface: no shell, no back
  chevron, no open/close state, no controlled prop threaded through the shell. The
  right structure is usually smaller than the wrong one. When a fix keeps growing
  plumbing, that is evidence the shape is wrong.
- **The labels had to be MEASURED, not estimated.** The options ARE the 22/600 chrome
  title and they cannot shrink or wrap; three of them plus the two round buttons have
  to fit 375px. "My chats" + "Browse" came to 278px against a 247px budget and would
  have pushed the buttons off screen. "Church / Mine / Open" is 211. A five-minute
  browser measurement decided the copy.
- **Grammar is part of the fit.** The three options are CATEGORIES ("which chats?
  church ones / mine / open ones"). "Browse" was rejected for that slot because it is
  an ACTION wearing a category's clothes — in an exclusive switch, the odd one out
  reads as a button someone dropped in the wrong control.

**Two things that fell out of doing it, worth keeping:**

1. **Demoting a surface must not cost taps, or you have just hidden it.** Moving the
   chat row to the bottom while pointing the Home tile at "the chats tab" would have
   made the tile strictly worse than the card it replaced. The tile lands directly on
   the browse page instead. *When you move an entry point down, check the paths that
   USED to lead to it still land in the same place.*
2. **A parent that needs to open a child's surface should own that state, not poke it
   through an effect.** The first cut passed a trigger counter and opened browse in a
   `useEffect` — which is a `react-hooks` lint error (setState synchronously within an
   effect) and a cascading render. Lifting `browseOpen` into the shell removed the
   effect entirely and made the two viewports symmetric, since the shell already owned
   the desktop twin. The lint rule was pointing at a real design smell, not noise.
