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
