## A derived display value has to be fixed at EVERY producer — chat titles have two (2026-08-08)

**What happened.** A DM's title is per-viewer (the OTHER person's name);
`groups.name` holds only the creator's side of it, so the recipient saw their own
name as the conversation title. Fixed it in `get_chat_list` — the chat-list SWR
fetcher — verified the list, and moved on. The e2e then failed: opening
`/home?tab=chats&chat=<id>` STILL showed the wrong name.

There are **two** RPCs producing chat titles:
- `get_chat_list` — the client SWR fetcher (mobile list, desktop panel, search).
- `get_chat_previews` — the SSR/boot path (`app/home/page.tsx` →
  `initialRecentChats`) and home-app's realtime refetcher. It is what BACKFILLS
  the ChatScreen header for a URL-restored chat (`globalOpenChat.name` starts `""`
  and is filled from `recentChats`).

They are near-identical twins that must be edited together.

**The rule.** Before declaring a derived-display fix done, grep for every producer
of that field rather than the one the happy path happens to use — and prove it on
the DEEP-LINK path, not just the list. The list and the header had different
sources; only the deep link exposed the second one.

**Why the test caught it and I didn't:** the list is what you look at while
developing, so the fix looked complete. Asserting on `?chat=<id>` (a cold restore
with no list interaction) is what separated the two code paths.

Related: [[a-dm-is-a-pair-not-a-room]]
