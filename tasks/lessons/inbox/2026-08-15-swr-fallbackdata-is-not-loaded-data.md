## SWR's `isLoading` ignores `fallbackData` — leading a loading flag with it throws away the seed (2026-08-15)

**What happened.** The chat list was made to server-render from an SSR-seeded
`initialChatList`, so the rows arrive as HTML before any chat JS executes. It worked —
the markup was provably in the response — and the screen still showed a spinner.

The list's gate was `const loading = isLoading || …`. SWR defines `isLoading` as *"there
is an ongoing request and no **loaded** data"*, and `fallbackData` deliberately does not
count as loaded data — it is a fallback, not a fetch result. So on every visit, with a
fully-populated list already rendered underneath, `isLoading` was `true` until the client
revalidation returned, and the spinner covered rows that were already on screen.

The bug is invisible in the usual way: nothing errors, the data is correct, the HTML is
correct, and the feature "works" — it is just slow for the exact duration you were trying
to eliminate. It also is NOT server-only; the same discard happens on the client.

**The rule.** When a component is seeded — `fallbackData`, `keepPreviousData`, an SSR
prop — the loading question is **"do I have rows to show?"**, never **"is a request in
flight?"**. Gate on the data:

```ts
const loading = allGroups.length === 0 && (isLoading || !!error)
```

Whenever rows exist, from any source, render them: stale beats empty, and seeded beats
stale. Reserve the spinner for the genuinely empty cases.

**Second half, easy to miss:** an ERRORED fetch with no rows must also show the spinner,
not fall through to the "No chats yet" empty state. An empty state is a claim about the
USER's data ("you have no conversations"); a failed request is a claim about the network.
Rendering the first when the second is true tells the user something false, and it is the
kind of wrong that gets reported as "it deleted my chats."

**Where this generalises:** any `useSWR` in this repo that pairs `fallbackData` with an
`isLoading`-led branch has the same latent bug. The seed exists precisely so the user
never waits; a loading flag that ignores the seed re-imposes the wait it removed.

Related: [[a-perf-number-from-a-loaded-machine-is-not-a-number]]
