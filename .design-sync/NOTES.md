# Design Sync Notes — CENTRAL

## Re-sync quick start

```bash
# Stage fresh scripts first (always — path version changes each session)
SKILL_BASE="/private/tmp/claude-501/bundled-skills/2.1.185/20e328bc1dfa6589f88ccaa277bae527/design-sync"
cp -r "$SKILL_BASE/package-build.mjs" "$SKILL_BASE/package-validate.mjs" "$SKILL_BASE/package-capture.mjs" "$SKILL_BASE/resync.mjs" "$SKILL_BASE/lib" "$SKILL_BASE/storybook" .ds-sync/

node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
# If SYNC_STALE fires, rebuild once more and validate again
```

## Synth-entry mode (critical)

This is a Next.js app, not a published npm package. There is no `dist/` directory. The converter must run in synth-entry mode:

- `cfg.entry = ".ds-entry.tsx"` (set in config) — a synthetic barrel that re-exports all component source files
- `.ds-entry.tsx` lives at the repo root (`/Users/brianjeong/Desktop/Projects/central/.ds-entry.tsx`)
- Without `--entry`, the build fails with `ENOENT: no such file or directory, open '.../node_modules/central/package.json'`
- `cfg.entry` in config.json handles this so `--entry` flag is no longer needed on the command line

## Why PKG_DIR must be the repo root

The dts.mjs `projectFor` function reads `join(PKG_DIR, 'package.json')`. When `--entry` points to a file at the repo root, `PKG_DIR = dirname(resolve(entry))` = repo root, and `package.json` exists there.

## Components (22 total, two groups)

**`components/central/` group (9 Central brand components):**
CardTitle, CentralButton, CentralCard, ChatStrip, InsetHairline, PageTitle, SectionHeader, StatCard, UpNextCard

**`components/general/` group (13 shadcn/ui primitives):**
Avatar, AvatarFallback, AvatarImage, BottomNav, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, ChatsSection, Input, Label

- `ChatPreview` is explicitly excluded via `componentSrcMap: null`
- `CardTitle` from Central wins over shadcn's `CardTitle` — shadcn version excluded from `.ds-entry.tsx`
- `TabPageHeader` intentionally excluded — uses `hidden md:block` Tailwind classes, invisible at mobile viewport
- All components have authored previews in `.design-sync/previews/`

## CSS entry

`cssEntry: ".design-sync/tailwind-compiled.css"` — Tailwind compiled output (99 KB), prepended with Central design tokens from `app/globals.css`. If `globals.css` token definitions change, update `tailwind-compiled.css` by running:

```bash
node -e "
const fs = require('fs');
const globals = fs.readFileSync('app/globals.css', 'utf8');
const compiled = fs.readFileSync('.design-sync/tailwind-compiled.css', 'utf8');
// Remove old prepended Central tokens (everything before '/* === Tailwind compiled CSS === */')
const tailwindStart = compiled.indexOf('/* === Tailwind compiled CSS === */');
const compiledOnly = tailwindStart >= 0 ? compiled.slice(tailwindStart) : compiled;
// Extract :root and .dark blocks from globals
const lines = globals.split('\n');
let extracted = ''; let inBlock = false; let depth = 0;
for (const line of lines) {
  const trimmed = line.trim();
  if (!inBlock && (trimmed === ':root {' || trimmed === '.dark {')) { inBlock = true; depth = 0; extracted += line + '\n'; for (const c of line) { if (c === '{') depth++; if (c === '}') depth--; } continue; }
  if (inBlock) { extracted += line + '\n'; for (const c of line) { if (c === '{') depth++; if (c === '}') depth--; } if (depth <= 0) { inBlock = false; extracted += '\n'; } }
}
const animations = globals.match(/@keyframes [^}]+\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gs) || [];
const animClasses = globals.match(/\\.animate-[a-z-]+\s*\{[^}]+\}/g) || [];
const output = '/* === Central Design Tokens from globals.css === */\n' + extracted + '\n/* === Animations from globals.css === */\n' + animations.join('\n\n') + '\n\n' + compiledOnly;
fs.writeFileSync('.design-sync/tailwind-compiled.css', output);
console.log('Updated:', output.length, 'bytes');
"
```

## Known render behavior

- **Label / CardFooter**: occasionally show `rootEmpty` on first validate run (puppeteer timing flakiness). Run validate a second time — they pass consistently.
- **SYNC_STALE**: if validate fires this after running twice, rebuild once and re-validate.
- All 22 components pass the render check cleanly.

## `.ds-entry.tsx` naming conventions

- `components/ui/card.tsx` exports shadcn `CardTitle` but we intentionally skip it (Central's `CardTitle` from `card-title.tsx` wins)
- The `.ds-entry.tsx` does explicit named exports from `card.tsx` to avoid the naming conflict

## Re-sync risks

- **`.ds-entry.tsx`** must remain in sync with `componentSrcMap` — if a new component is added to the config, add its export to `.ds-entry.tsx` too
- **`tailwind-compiled.css`** is a point-in-time snapshot; if `globals.css` tokens change, re-run the extraction script above
- **Component props are `[key: string]: unknown`** — ts-morph can't extract full types from this Next.js app's source files. Props documentation comes from the authored `.prompt.md` notes
- **ChatsSection/ChatStrip** require runtime data (`chats` array). See their preview files for the expected shape.
