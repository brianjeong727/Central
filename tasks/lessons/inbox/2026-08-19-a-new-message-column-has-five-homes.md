## A new message column has FIVE homes, and the mapper is the one you forget (2026-08-19)

Adding the invite-card message type meant a new `messages.invite_group_id`. It was added to
the column, to `MESSAGE_SELECT`, to the `Message` type, and to the render branch — and the
card still rendered as a plain text bubble.

The miss was `enrichMessageRows` (`app/home/chat-thread-cache.ts`). That mapper builds an
**explicit object literal** from each row, so a column added to the select is fetched over the
wire and then silently discarded on the way into state. Nothing errors; the field is just
`undefined`, and any render branch guarded on it never fires. The bug looks like "my JSX is
wrong" and is actually "my data never arrived".

**The five places a new `messages` column must land:**
1. the column itself (migration),
2. `MESSAGE_SELECT` in `chat-thread-cache.ts`,
3. **`enrichMessageRows` in the same file — the explicit mapper**,
4. the `Message` type in `app/home/types.ts`,
5. every consumer: the row renderer, the chat-list last-message preview, the link-preview
   scan, and the push dispatch body.

The realtime INSERT path is the exception — it spreads `...raw`, so it carries new columns for
free. Which is its own trap: the feature can work live and be broken on reload, or vice versa.
Test both paths.

General form: **an explicit object mapper is a silent allowlist.** Whenever a select and a
mapper sit in the same file, adding to one without the other fails quietly, and it fails at the
render layer where you will not look first.
