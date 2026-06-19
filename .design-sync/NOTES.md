# Design Sync Notes — CENTRAL

## Re-sync quick start

```bash
# Stage fresh scripts first (always)
SKILL_BASE="/private/tmp/claude-501/bundled-skills/2.1.183/1e07a2619e66400693f777b8de60fae7/design-sync"
cp -r "$SKILL_BASE/package-build.mjs" "$SKILL_BASE/package-validate.mjs" "$SKILL_BASE/package-capture.mjs" "$SKILL_BASE/resync.mjs" "$SKILL_BASE/lib" "$SKILL_BASE/storybook" .ds-sync/

# The entry file must be provided — see "Synth-entry mode" below
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --entry ./.ds-entry.tsx --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

## Synth-entry mode (critical)

This is a Next.js app, not a published npm package. There is no `dist/` directory. The converter must run in synth-entry mode:

- `cfg.entry = ".ds-entry.tsx"` (set in config) — a synthetic barrel that re-exports all component source files
- `.ds-entry.tsx` lives at the repo root (`/Users/brianjeong/Desktop/Projects/central/.ds-entry.tsx`)
- Without `--entry`, the build fails with `ENOENT: no such file or directory, open '.../node_modules/central/package.json'`
- `cfg.entry` in config.json handles this so `--entry` flag is no longer needed on the command line

## Why PKG_DIR must be the repo root

The dts.mjs `projectFor` function reads `join(PKG_DIR, 'package.json')`. When `--entry` points to a file at the repo root, `PKG_DIR = dirname(resolve(entry))` = repo root, and `package.json` exists there. Any other location would fail.

## Components (14 total, all in `components/general/`)

Avatar, AvatarFallback, AvatarImage, BottomNav, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, ChatsSection, Input, Label

- `ChatPreview` is explicitly excluded via `componentSrcMap: null`
- All components have authored previews in `.design-sync/previews/`

## CSS entry

`cssEntry: ".design-sync/tailwind-compiled.css"` — the compiled Tailwind output (92 KB). This file is committed. If design tokens change, re-run the Tailwind compilation and commit the updated file.

## Known render warns

_(none — all 14 components pass the render check cleanly as of 2026-06-19)_

## Re-sync risks

- **`.ds-entry.tsx`** must remain in sync with `componentSrcMap` — if a new component is added to the config, add its export to `.ds-entry.tsx` too
- **`tailwind-compiled.css`** is a point-in-time snapshot of compiled Tailwind output; if Tailwind tokens/config change, this file gets stale and the DS bundle ships outdated token values
- **Component props are `[key: string]: unknown`** — ts-morph can't extract full types from this Next.js app's source files (no proper `.d.ts` exports). Props documentation comes from the authored `.prompt.md` notes
- **ChatsSection** is a complex component that requires runtime data (`chats` array with specific shape). The `WithChats` and `EmptyChats` stories in the preview cover the data shape; the component will fail with no data passed

## First-sync recovery (if project is deleted again)

1. Create a new `PROJECT_TYPE_DESIGN_SYSTEM` project via `DesignSync(create_project, name: "CENTRAL Design System")`
2. Update `projectId` in `.design-sync/config.json` immediately
3. Run build + validate (both pass without changes)
4. Upload via the incremental path (project is empty)
