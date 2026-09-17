## A "fresh Supabase access token" blocker is a /mcp reconnect, not a request for a key (2026-09-16)

The chat-text-size session (s2, 2026-09-13) built the whole feature, then stalled for
three days on "the migration is BLOCKED on a fresh Supabase access token" and asked Brian
to generate a personal access token in the dashboard and paste it into chat. The
truth-fixes session (s3, 2026-09-15) hit the same failure and cleared it in one step:
`/mcp` → "Reconnected to supabase." → the migration applied.

The Supabase MCP server's OAuth session expires; when it does, every `mcp__supabase__*`
call fails with an auth error that READS like "you need a new token". It is a reconnect.
Asking Brian for a dashboard PAT (a) blocks the task on him for something that is not his
decision, (b) invites a long-lived secret into the chat, and (c) is the wrong fix anyway —
the MCP is OAuth-bound, not PAT-bound.

**Rule:** when a Supabase MCP call fails on auth, tell Brian in one line to run `/mcp` and
reconnect (it is a local slash command — you cannot run it yourself), then retry. Never
ask for a token. If reconnecting doesn't clear it, THEN it is an outage (check
status.supabase.com — the 09-15 session also hit a real "Partially Degraded" incident and
correctly waited it out).
