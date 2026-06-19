# CENTRAL Component Library — Design Agent Conventions

## Brand identity
CENTRAL is a multi-tenant church communication platform for college ministries. The visual language is **Quiet Modern**: regal plum (`#3E1540`, `#2D0F2E`) as the primary brand color, warm ivory (`#FBF8F2`) as the background/surface color. All designs must use this palette. Never substitute generic grays for the ivory background.

## Wrapping and setup
Components need **no provider wrapper** — they are self-styling. Load `_ds_bundle.js` once; every export is on `window.Central`. Wrap compositions in a `background: #FBF8F2` container to match the app's surface (the `bg-background` Tailwind class or an inline style both work).

```jsx
const { Button, Card, CardHeader, CardTitle, CardContent } = window.Central;

export default function Example() {
  return (
    <div className="bg-background p-6" style={{ maxWidth: 390 }}>
      <Card>
        <CardHeader>
          <CardTitle>Friday Night Worship</CardTitle>
        </CardHeader>
        <CardContent>
          <Button>RSVP</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

## Styling idiom — Tailwind CSS v4 utilities

Style your own layout glue with Tailwind v4 utility classes. Available families from the shipped CSS:

| Purpose | Classes |
|---|---|
| Backgrounds | `bg-background` `bg-card` `bg-primary` `bg-muted` `bg-destructive` `bg-secondary` |
| Text colors | `text-foreground` `text-muted-foreground` `text-primary` `text-primary-foreground` `text-card-foreground` `text-destructive` |
| Spacing | `p-{1–9}` `px-{1–8}` `py-{1–8}` `gap-{1–8}` |
| Sizing | `text-sm` `text-xs` `rounded` |
| Layout | `flex` `flex-col` `items-center` `justify-between` `w-full` `max-w-[390px]` |

CSS custom property tokens (use in `style={{}}` or custom CSS when needed):
- `var(--primary)` — regal plum (#3E1540)
- `var(--background)` — warm ivory (#FBF8F2)
- `var(--foreground)` — dark text
- `var(--muted-foreground)` — secondary text
- `var(--card)` — card surface
- `var(--border)` — border color
- `var(--radius)` — base border radius

Do **not** invent Tailwind classes not shown above — Tailwind v4 generates only what's in the bundle, and unrecognized classes silently produce unstyled output.

## Where to find the truth
- Component styles: `_ds_bundle.css` (imported from `styles.css`)
- Component API: each `components/general/<Name>/<Name>.d.ts` and `<Name>.prompt.md`
- Component props: all components accept standard HTML attributes plus `className` and `children`; component-specific props (e.g. `ChatsSection`'s `chats` array, `Button`'s `variant`/`size`) are documented in `.prompt.md` and shown in preview stories

## Key component notes
- **Button** variants: `default` (plum filled) | `outline` | `secondary` | `ghost` | `destructive` | `link`. Sizes: `default` | `sm` | `lg`
- **Card** is a compound: always compose `Card > CardHeader > CardTitle + CardDescription + CardContent + CardFooter`
- **ChatsSection** requires a `chats` array — see the `WithChats` story for the expected shape (`id`, `groupName`, `lastMessage`, `unreadCount`, `avatarColor`, `initials`, `time`)
- **Avatar** compounds: compose `Avatar > AvatarImage + AvatarFallback` — `AvatarFallback` renders initials when the image fails
- **BottomNav** viewport is narrow (390×80); use `cardMode: "single"` or its configured override when embedding it
- Mobile container is always `max-w-[390px] mx-auto` — never render layouts wider than 390px
