## Account deletion must SCRUB identity, not SEVER it (2026-08-08)

**What happened.** `deleteMyAccount` listed `group_members` among the personal
rows it deletes. That quietly broke the product's own promise ("Messages you sent
stay in their chats, shown as *Former member*"): every membership-based join lost
the person. Reproduced on a real DM (rolled back):

| after deletion | before fix | after fix |
|---|---|---|
| message author | Former member | Former member |
| **DM title** | **the viewer's OWN name** | Former member |
| chat roster | (person absent) | Former member |

The DM title derives from "the other member of this group"; with the row gone it
fell back to the stale `groups.name`, which is the creator-side label — so the
survivor saw either the deleted person's old name (looks like nothing happened)
or, when they created the thread, themselves.

**The rule.** A tombstone needs an ANCHOR in every structure that renders its
content. Delete the personal *columns* (read position, mute/pin, notify mode),
keep the *row*. Deleting the association makes the retained content unattributable
— which is worse than either fully deleting or fully keeping it.

**Generalize:** before removing a join row during a delete/anonymize flow, ask
what still renders the user's retained content. If anything resolves identity
*through* that row, scrub it instead.

---

## Destructive steps must not run before the step that can fail

Same file, separate defect. `deleteMyAccount` scrubs the profile (step 4) and
deletes every personal row (step 5) BEFORE hard-deleting `auth.users` (step 8).
Three FKs to `auth.users` were `NO ACTION` — `finance_funds.created_by`,
`receipt_fund_allocations.reviewed_by`, `.signed_off_by` — so any treasurer or
president who had touched a fund or receipt hit:

```
ERROR 23503 … violates foreign key constraint "finance_funds_created_by_fkey"
```

at the last step, landing them in the worst state available: **data destroyed,
login still alive.** Recoverable only because `deleted_at` happens not to gate
auth, so they can log back in and retry.

**The rule.** When a sequence has one step that can hard-fail on state you don't
control, either make it un-failable first or run it before anything destructive.
Here: the FKs became `ON DELETE SET NULL` (they are audit pointers, all nullable,
and the finance rows must survive with an anonymous actor).

**The tell for the whole class:** an FK to `auth.users` with `NO ACTION` /
`RESTRICT` is a latent "this user can never be deleted" bug. Audit them whenever a
new `created_by` / `reviewed_by` column ships.

Related: [[a-dm-is-a-pair-not-a-room]]
