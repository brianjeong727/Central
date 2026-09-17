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
- [x] Migration `profiles_chat_text_size` applied live 2026-09-16 (rls-reviewer BEFORE +
      AFTER, both clean; grants are table-level on profiles so nothing else needed).
- [x] Save chains `.select().single()` so a zero-row RLS/filter miss errors instead of
      reading as success (reviewer warn, proven live).
- [x] Mobile picker is a four-cell track (the loose fchips wrapped to two lines at 390 and
      the ivory-off chips vanished on the ivory card).
- [x] e2e `chat-text-size.mobile.spec.ts` — 4/4 green on :3002; screenshots 390 + 1440 reviewed.
- [x] verify.sh --port 3002 PASS. Part 1 shipped separately as PR #409.
