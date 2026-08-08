## "Desktop" is not a width — a phone in landscape is 874px wide (2026-08-08)

**What happened.** Rotating the iOS app showed the full desktop shell — plum rail,
context panel, breadcrumb, 60px serif greeting — squeezed into a 402px-tall phone
screen. The mobile/desktop split was a bare `min-width: 768px`, and an iPhone in
landscape is 874–956px.

**The rule.** Width alone cannot distinguish a phone from a laptop. The predicate
is now:

```
desktop = (min-width: 768px) and ((hover: hover) or (min-width: 1024px))
```

- `hover: hover` is the mouse/trackpad signal. Laptops match it — including
  touchscreen laptops, whose PRIMARY pointer is still the trackpad. Phones and
  tablets do not.
- The 1024px arm preserves today's tablet behaviour. No iPhone reaches it (the
  widest, Pro Max, is 956 landscape), so a phone can never fall through to desktop
  at any rotation.

**The part that actually bites: the predicate was written SEVEN times.** Tailwind's
`md:` variant, four hand-written `@media` blocks in `globals.css`, and six
`matchMedia`/`innerWidth` calls in TS. Fixing only the Tailwind variant would have
left `.shell-scroll`'s nav-clearance reset firing in landscape *while the mobile
nav pill was showing* — content under the pill, and a bug that looks unrelated.

It now lives once: `lib/breakpoints.ts` (no imports, so `components/central` LEAF
files may consume it) plus `@custom-variant md` / `@custom-variant max-md` in
`globals.css`. **`max-md` must be overridden too** — Tailwind derives it from
`--breakpoint-md`, so on its own it stays the complement of the OLD query and the
two variants can both apply (or neither) in the 768–1023px touch band. Custom CSS
that needs the breakpoint uses `@variant md { … }` rather than re-typing a media
query.

**Generalize:** any `min-width` used to mean "device class" is wrong the moment an
orientation changes. And before changing a breakpoint, grep for every hand-written
copy of it — the CSS variant is usually the minority of them.

---

### Two test traps this exposed

**A CSS-uppercased label matches nothing.** The rail's `WORKSPACE` is
`text-transform: uppercase`; the DOM text is `Workspace`. `getByText("WORKSPACE",
{exact:true})` matched zero elements — so `toHaveCount(0)` passed on BOTH
viewports and the absence assertion proved nothing. Assert on something the CSS
does not rewrite (`aria-label`).

**Presence is not visibility.** `DesktopSidebar` is always mounted and toggled by
`hidden md:flex`, so it exists in the DOM at phone width. `toHaveCount(0)` fails
there for the wrong reason; the real question is `.filter({ visible: true })`.

Related: [[a-dm-is-a-pair-not-a-room]]
