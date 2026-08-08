## A DM is a PAIR, not a room — key it, don't create it (2026-08-08)

**What happened.** Three DM groups existed in production between the same two
people. The chain: chat settings offered "Leave chat" on a DM (it was gated
`isMy || isDM`); leaving DELETES your `group_members` row; the "does a DM already
exist?" check was a two-hop membership query (*which of my dm groups is the other
person also in?*), so with that row gone it answered "no" — and the caller created
another DM. It also explained a reported "DMs don't send notifications": the push
resolver fans out to group members, and the person who left was no longer one, so
`recipients: []`. Nothing was wrong with push.

**The rule.** An entity whose identity is a SET of participants must be keyed on
that set, not discovered by walking membership rows. `groups.dm_key` is
`least(uid,uid):greatest(uid,uid)`, UNIQUE per ministry, and DMs are born only via
`get_or_create_dm()` — a SECURITY DEFINER RPC that is idempotent and re-asserts
both memberships on every call, so a lost row heals the next time anyone opens the
thread. `createGroup`'s type union no longer accepts `"dm"` at all.

**Two things that made it airtight rather than merely better:**
- The unique index is PARTIAL (`where dm_key is not null`), so a NULL key was a
  silent escape hatch — an insert that omitted `dm_key` created an untracked DM no
  future duplicate check would see. A CHECK constraint (`type <> 'dm' or dm_key is
  not null`) closes it. **A partial unique index is only as strong as a NOT NULL
  guarantee on its predicate column.**
- Removing the *cause* (no Leave on a DM) is not enough on its own — the data was
  already corrupted, and any future path could recorrupt it. Structure + self-heal,
  not just the affordance fix.

**Generalize:** when a bug report says "X doesn't notify," check whether the
recipient is still a member before touching the notification stack. Three of the
five reported symptoms here were one missing row.
