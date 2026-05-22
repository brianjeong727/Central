# Lessons

- When changing a responsive nav, verify the desktop grid has one explicit track per visible region. A three-part header needs left, center, and right columns, not a two-column grid with an implicit third item.
- For warm, welcoming landing imagery, avoid heavy ink/plum overlays across the whole hero. Use a lighter warm scrim and localized contrast behind text so the image stays bright.

## Semester / date boundary bugs
- `getMonth() + 1` returns 1–12. The spring semester runs Jan–May, so the spring guard must be `month <= 5`, not `month <= 4`. Off-by-one on the boundary causes the entire month of May to fall into the wrong semester, breaking every DB query that uses that label as a filter.
- Always verify the computed semester label matches the seeded test data. If the seed uses `spring_2026` but the app computes `summer_2026`, the feature silently shows an empty state instead of the real data. Confirm the two match before testing.

## Server action error handling
- Every `"use server"` action must have a top-level `try/catch`. Without it, any unhandled DB error or exception causes Next.js to return a cryptic `500 Internal Server Error` ("An error occurred in the Server Components render") with no visible cause in the UI or standard logs. The fix: wrap the whole body in try/catch and return `{ error: e.message }` so the client can surface a real message.
- Every client-side call to a server action needs a `catch` block, not just `try/finally`. `finally` runs but does not catch — if the action boundary itself throws (network error, serialization failure, unhandled server exception), the error propagates as an unhandled Promise rejection and the UI shows nothing. Pattern: `try { ... } catch (e) { setError(e.message) } finally { setLoading(false) }`.
- Always check the return value of Supabase delete/insert/update and return the error with a descriptive message (not just "Failed to save"). Vague errors make production debugging impossible.
