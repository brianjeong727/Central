## `void supabase.from(...)` silently never runs — PostgREST builders are lazy thenables (2026-08-25)

**What happened.** A refactor in `app/home/tabs/meeting-notes.tsx` extracted a
debounced-save helper whose write closure was:

```ts
void supabase.from("meeting_note_decisions").update({ text }).eq("id", id)
```

No request was ever sent. Editing a decision, adding an agenda "detail" line, and
checking off an agenda item all appeared to work — the optimistic cache patch
repainted the UI immediately — and every one of them was discarded on reload. It
also silently regressed agenda check-off, which had worked before the refactor
(the old code awaited its update; the new helper dropped the await).

**Why.** A `PostgrestFilterBuilder` is **not a Promise**. It is a *thenable*: it
issues its HTTP request inside its own `.then()`. A real Promise is already
running by the time you hold it, so `void p` is harmless and merely discards the
result — which is exactly the intuition that makes this bug invisible in review.
A thenable has not started, and `void` never calls `.then()`, so the query is
constructed, discarded, and never sent. No error, no rejection, no console
warning — the expression is legal TypeScript with a legal type.

**How to apply.**

- **`void` in front of a Supabase query is always a bug.** It is safe in front of
  a genuine Promise (`void mutate(...)`, `void someAsyncFn()`), which is why the
  pattern reads as idiomatic. It is never safe in front of `supabase.from(...)`.
  Write `await`, or `.then()`, or at minimum `.then(() => {}, () => {})` in a
  deliberate fire-and-forget — but then you have no error path, so prefer `await`
  inside an async closure.
- **Grep for it after any refactor that moves writes into a closure:**
  `grep -rn "void supabase" app components lib`. This sweep found a SECOND live
  instance at `app/home/tabs/plan-tab.tsx:15648` — swapping a person on a
  **published** DGL rotation patches local state and never persists, so the swap
  survives until reload and then vanishes. Same defect, different feature,
  shipped and unnoticed.
- **A passing build and a green lint prove nothing here.** The types are correct.
  Only a network trace, a reload, or a DB read catches it. This is why a
  user-facing change needs a click-through that RELOADS or reads back the row —
  asserting on the optimistically-patched UI would have passed while the feature
  was entirely broken. The e2e guard added for this
  (`e2e/meeting-notes.spec.ts` → "agenda check-off reaches the database") asserts
  after a reload for exactly that reason.

**Related:** [[optimistic-updates-need-a-rollback-path]] — an optimistic patch
paired with a write that cannot fail loudly is indistinguishable from a working
feature.
