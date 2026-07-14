---
description: Point the iOS simulator at THIS session's dev server and relaunch the app. Patches capacitor.config.ts to localhost:<slot port> (dev-only overlay — never committed), cap-syncs, builds and installs on the booted simulator.
argument-hint: "[simulator name, defaults to the booted one]"
---

Relaunch the iOS simulator app against THIS worktree's dev server, so the sim shows the change this session just made. The app's `server.url` is baked into the build from `capacitor.config.ts`, so a port change always needs: patch config → `cap sync` → rebuild/reinstall. A plain simulator reboot is never enough.

Steps:

1. **Resolve this session's port.** Match the worktree directory basename (`basename "$(git rev-parse --show-toplevel)"`) against `.claude/session-slots.json` (`slots[].dir` → `port`; the shared `central` checkout maps to 3000 — allowed, but note it's the shared checkout). If the basename matches nothing, STOP and say so.

2. **Ensure the dev server is up** on that port: `curl -s -o /dev/null -w '%{http_code}' http://localhost:<port>/` → `200`. If it's down, start it from the worktree root in the background (`npm run dev -- -p <port>` — ALWAYS with `-p`, never bare) and poll until 200.

3. **Apply the dev overlay to `capacitor.config.ts`** (idempotent — edit whatever is currently there):
   - `server.url` → `"http://localhost:<port>"`
   - `cleartext: true` inside `server` (plain-HTTP local dev)
   - `"localhost"` present in `allowNavigation`
   This mirrors the s2 dev patch (`.git/session-locks/s2-capacitor-dev.patch`). It is a LOCAL DEV OVERLAY: **never commit it**. Never `git add capacitor.config.ts` while it carries a localhost URL; prod must keep `https://www.joincentral.app`.

4. **Sync the native project:** `npx cap sync ios` from the worktree root.

5. **Pick the simulator:** if an argument was given, use that device name; otherwise use the already-booted device (`xcrun simctl list devices booted`); if none is booted, boot `iPhone 17`. Then build + install + launch: `npx cap run ios --target "<udid>"`. First build in a worktree takes a few minutes (xcodebuild); later runs are incremental.

6. **Verify + report** in one sentence: which port the sim now points at, which device, and — always — the reminder that `capacitor.config.ts` is carrying an uncommitted dev overlay (revert with `git checkout -- capacitor.config.ts` before any commit that would touch it; the pre-ship check is that `git diff capacitor.config.ts` shows no localhost URL).

Notes:
- One simulator shows ONE server at a time (same bundle ID overwrites the install). To compare two slots side-by-side, clone a second device (`xcrun simctl clone "iPhone 17" sim-<port>`) and run the other worktree's build against the clone.
- This command never touches other sessions' dev servers or worktrees — only the current worktree's config and build.
