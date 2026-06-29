# Landing Page Redesign

- [x] Inspect current landing page and available chapel image assets
- [x] Redesign root landing page with quiet modern chapel-led aesthetic
- [x] Verify with lint/build and local browser preview

## Review

- Reworked the root landing page around the existing chapel image, restrained plum/ivory/ink palette, editorial serif headings, compact radius controls, and quieter feature/rhythm sections.
- Fixed the desktop nav to use explicit left, center, and right columns so the logo, links, and auth actions align correctly.
- Brightened the chapel hero by returning to the original image feel with only minimal warm overlay and localized contrast behind text.
- Reduced the bottom ivory fade and moved hero content above it so CTAs and quote remain readable.
- Added explicit Next viewport metadata so the landing page has a dependable mobile layout.
- Verified `npx eslint components/landing-page.tsx app/layout.tsx` and `npm run build`.
- Also ran full `npm run lint`; it still fails on existing unrelated repo issues outside this change.

# App Walkthrough QA

- [x] Establish baseline build/lint status
- [x] Inspect public desktop routes: `/`, `/login`, `/signup`, `/ministries`, `/onboarding`, `/join`
- [x] Inspect authenticated app implementation: Home, Announcements, Chats, Directory, Profile, Plan/Giving/Settings surfaces
- [x] Fix concrete bugs found during walkthrough
- [x] Capture design recommendations with file references
- [x] Re-run verification and document results

## Review

- Baseline: `npm run build` passed. `npm run lint` initially failed with React compiler errors and linting a vendored PDF worker.
- Fixed hard lint/build issues in auth/join/onboarding/ministries/pick-ministry and ignored `public/pdf.worker.min.mjs`.
- Public desktop walkthrough: landing, login, signup, and ministries render cleanly. `/join` and `/onboarding` redirect to auth when unauthenticated, consistent with the current middleware behavior.
- Authenticated source walkthrough: fixed the missing `giving` tab validation in `HomeApp`, removed production chat debug logs, and added ministry-scoped announcement update/delete filters.
- Design recommendations: keep the landing image bright and warm; lift the first post-hero heading farther above the fold/fade; consider reducing the auth form's large empty desktop card feel; later clean up unused imports/image warnings across the home tabs.
- Verification: `npx eslint` on touched files exits with warnings only, `npm run build` passes, and full `npm run lint` exits 0 with 66 pre-existing warnings.

# Full Project Workflow Audit

- [ ] Map every route, middleware redirect, server action, and major client workflow
- [ ] Run baseline verification: lint/build and current route accessibility
- [ ] Walk public flows: landing, login, signup, ministry discovery, onboarding, join, pending, pick ministry
- [ ] Walk authenticated flows in source and browser where possible: home, announcements, chats, plan, directory, giving, profile, settings/admin
- [ ] Check Supabase writes for tenant guards, role guards, optimistic update failure states, and redirect consistency
- [ ] Fix concrete bugs that are safe and scoped
- [ ] Document design recommendations and workflow risks with file references
- [ ] Re-run verification and add final review notes

# Three-Perspective Product Review

- [x] Inspect live landing site at `joincentral.app`
- [x] Map all route files, major screens, and product workflows in the local codebase
- [x] Review UI/UX design quality screen by screen with code references
- [x] Review startup/product-market risk from a YC partner perspective
- [x] Review adoption trust and ministry fit from a pastor perspective
- [x] Synthesize the top three fixes shared across perspectives

## Review

- Live site reviewed at `https://www.joincentral.app/` with desktop and mobile screenshots captured to `/tmp/joincentral-desktop.png` and `/tmp/joincentral-mobile.png`.
- Local workflow reviewed from `/Users/brianjeong/Desktop/Projects/central`, including `proxy.ts`, all app routes, auth flows, home shell, announcements, chats, directory, plan/praise team, profile/journal, giving, settings, admin, and server actions.
- Verification: `npm run build` passes. `npm run lint` currently fails on `components/landing-page.tsx:108` because the brand root link uses `<a href="/">` instead of Next `<Link />`; the repo also has 67 warnings.

# Review 1 Fix Pass

- [x] Fix blocking hygiene: lint error, stale docs/code mismatch where visible, and production-quality warnings that affect trust
- [x] Re-align product hierarchy: landing copy, Home greeting removal, and consistent primary CTAs
- [x] Tighten design-system discipline: reduce decorative gold, off-palette states, radius/header inconsistency, and generic auth surfaces
- [x] Improve high-risk UX surfaces: Giving, Directory privacy cues, Chat interactions, Plan/Praise Team naming brittleness
- [x] Harden interaction and tenant safety where Review 1 called out trust erosion
- [x] Verify with lint/build and browser screenshots

## Review

- Fixed the blocking landing-page lint error by replacing the root brand anchor with `next/link`, then tightened the landing copy around concrete ministry follow-up value instead of poetic positioning.
- Removed the Home greeting pattern across desktop and mobile copy, replacing it with ministry-centered hierarchy.
- Reworked Giving so it no longer implies fake card/ACH/Venmo/fund/monthly payment support; it now presents Zelle as a direct destination and clearly states Central does not process or track gifts.
- Added Directory privacy cues for member-shared profile details.
- Hardened Chat and Journal/Profile writes with ministry/user scoping where the UI was previously too trusting, and made chat delete verify the target ministry server-side.
- Reduced decorative gold usage across home, announcements, chat info, profile, pending, and plan surfaces while preserving gold for notification badges.
- Made Plan/Praise Team and church-chat eligibility less brittle by recognizing permissions and common team names, not exact strings only.
- Verification: `npm run lint` exits 0 with 65 warnings; `npm run build` passes; local landing page rendered at `http://localhost:3000/` and exposed the updated concrete H1/copy in browser DOM.

# Navigation Persistence System

Goal: make reload-restoration and nav-click behavior a consistent, enforced SYSTEM instead of per-tab hand-rolling.

## The three rules
1. **Browse/read state persists** (URL): top-level tab, every subtab, and every "what am I viewing" selection (open chat, open announcement, selected member/team/section/event, congregation/form responses, journal subtab). Reload restores exactly.
2. **Create/edit/settings surfaces are ephemeral** (plain state, never URL): compose announcement, plan team settings, congregation create form, journal entry editor, chat settings, create-chat, form fill. Reload drops you back to the underlying browse view; unsaved work gone.
3. **Clicking the ACTIVE top-level nav resets that tab to its landing** (clears its subtabs + selection + overlays). Switching to a DIFFERENT tab RESUMES its last sub-state (decided 2026-06-29).

## Architecture
- Single shared nav-state module (replace the 3 copied `replaceParam` impls in home-app, announcements-tab, plan-tab).
- Per-tab param registry: each tab declares its browse-params (persist) + editor-states (ephemeral). Active-nav-reset deletes that tab's params atomically (one `router.replace`).
- Codify as a CLAUDE.md convention + update lessons.md §URL State Persistence.

## Phase 1 — Foundation (shared module + active-nav-reset)
- [ ] Extract one shared atomic multi-param helper; delete the 3 duplicate `replaceParam` impls.
- [ ] Build the tab→owned-params registry.
- [ ] Active-nav-reset: re-clicking the active tab clears that tab's params + closes ephemeral overlays in ONE atomic replace. Desktop sidebar + mobile bottom-nav SYMMETRIC.
- [ ] Switching to a different tab: just set `?tab=`, leave other params (resume-where-left-off).

## Phase 2 — Flip editors to ephemeral
- [ ] `?compose=` (announcements) → plain state; remove reload-restore effect.
- [ ] `?view=settings` (plan team settings) → plain state; simplify auto-open + cleanup.
- [ ] `?cnew=1` (congregation create) → plain state.
- Consequence: deep-link-to-edit lost (deep-link-to-VIEW still works). Accepted.

## Phase 3 — Add missing browse params
- [ ] `?chat={groupId}` — open conversation (desktop + mobile). Absent → desktop auto-opens most-recent; mobile shows list.
- [ ] `?ann={id}` — open announcement detail (read view).
- [ ] `?jtab=` — journal subtab (devotionals/prayers/verses).
- [ ] form-responses read view param (forms-tab).

## Out of scope (flagged separately)
- `page.tsx:85` SSR teamType narrowing omits `"finance"` → finance teams misclassified until client refetch. Pre-existing, unrelated.

## Review
(filled at end)
