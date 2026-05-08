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
