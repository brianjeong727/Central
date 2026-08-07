## A CHECK constraint spanning two columns is a deploy-ordering trap (2026-08-06)

Adding `group_members.notify_mode` kept `muted` as a derived cache and guarded
the pair with:

```sql
CHECK (muted = (notify_mode is not distinct from 'off'))
```

The reviewer approved it *conditional on the app change landing alongside* — and
the app change was written in the same commit, so it looked satisfied. It wasn't.
**Migrations apply the moment you run them; app code lands only on deploy.** For
the whole window in between, production ran the OLD writer, which sets `muted`
alone, and every mute toggle in the live app failed `23514`.

**The rule:** when a migration adds a constraint that the CURRENT deployed code
would violate, you have opened a live production error the instant you apply it.
Either the constraint waits for the deploy, or — better — the database derives
the invariant itself so both code versions are correct:

```sql
CREATE TRIGGER ... BEFORE INSERT OR UPDATE ...
-- derive notify_mode from muted when a legacy writer sends only muted,
-- then always recompute muted from notify_mode
```

The trigger makes the CHECK belt-and-braces instead of load-bearing, and it also
defends against any future writer that knows about only one of the two columns.
Prefer *derive in the DB* over *couple correctness to deploy ordering*.

**Ask before applying any constraint-adding migration:** "would the code running
in production right now pass this?" If not, that's not a future problem, it's a
current outage of that code path.

Related: [[update-policy-missing-with-check]].
