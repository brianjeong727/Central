# Chat text size (feat/chat-text-size-pref)

Brian, 2026-09-13: messages read small vs iMessage/Messenger; make the size
configurable and raise the default.

- [x] Part 1 — default bump (inherited commit a0ebcac): one token `--chat-msg-size`,
      16px/1.35 at phone width, 14/1.4 desktop; em bubble padding; radius → `--r-pocket-sm`.
- [x] Composer textarea follows the token.
- [x] Four-step scale in globals.css (`html[data-chat-text]` + `[data-chat-text-preview]`):
      phone 14/16/18/20, desktop 13/14/16/18.
- [x] `profiles.chat_text_size` in the Profile type + home page select.
- [x] Shell applies the pref on `<html>` (home-app), optimistic state.
- [x] Profile → Settings → "Text size" (mobile hub row + view; desktop section),
      staged behind Save with a live preview (`TextSizeSection`).
- [ ] Migration: `profiles.chat_text_size text not null default 'md' check in (sm,md,lg,xl)`
      — BLOCKED on a fresh Supabase access token; verify the UPDATE grant covers it.
- [ ] e2e `chat-text-size.mobile.spec.ts` — default 16px; pref → bubble size; preview.
- [ ] verify.sh --port 3002 --e2e; screenshots at 390 + desktop; sandbox self-test.
- [ ] Commit, push decision.
