# Fix: group_members cross-tenant SELECT leak (APPLIED to prod)

**Applied:** 2026-07-17 to Central prod (`wgqpnilaokfipocsugqo`), migration `fix_group_members_cross_tenant_select_leak`.
**Branch:** `fix/group-members-cross-tenant-leak`.
**Origin:** surfaced by `rls-reviewer` during the perf-migration AFTER pass (a pre-existing breach, unrelated to that migration).

## The breach
SELECT policy `"Members can view their own group membership"` on `group_members` was:
```
((user_id = (select auth.uid())) OR is_group_member(group_id, (select auth.uid())) OR (select auth_is_admin_or_leader()))
```
The third disjunct had **no ministry boundary** → any `admin/leader/deacon/elder/pastor` in ANY ministry could read EVERY group-membership row platform-wide. Live proof: sandbox leader saw 46 rows though the sandbox owns only 16 (30 leaked from 5 other tenants).

## The fix
Scope the leader/admin disjunct to the caller's ministry, mirroring the existing `group_members` DELETE policy:
```sql
ALTER POLICY "Members can view their own group membership" ON public.group_members
USING (
  (user_id = (select auth.uid()))
  OR is_group_member(group_id, (select auth.uid()))
  OR ((select auth_is_admin_or_leader()) AND group_ministry_id(group_id) = (select auth_ministry_id()))
);
```
`group_ministry_id(group_id)` is row-dependent (takes `group_id`) so it is left un-wrapped; the no-arg helpers stay `(select …)`-wrapped for initplan caching.

## Verification (rls-reviewer, rolled-back dry-run of the exact ALTER) — GO
| role | pre-fix | post-fix | expected |
|---|---|---|---|
| sandbox leader Alex | 46 | **16** | own ministry only, not 0 ✓ |
| cross-tenant leader (other ministry) | 46 | **2** | leak closed ✓ |
| sandbox member Daniel | 16 | 16 | unchanged ✓ |
| sandbox visitor Sarah | 11 | 11 | unchanged ✓ |
| outsider | 0 | 0 | still denied ✓ |

No over-restriction; companion SELECT policy `"Members can view their groups"` (own rows only) and all write policies untouched; no blanket-permissive risk; no recursion. Stored policy form confirmed post-apply. Note: a leader with NULL `profiles.ministry_id` fail-closes to own-rows (correct — never sees more).

## How to test it yourself
`/pick-ministry` → **"Brian's Sandbox"** as a leader (Alex Kim): open a members/roster view backed by `group_members` — you should see only sandbox memberships, never other ministries'. As a plain member (Daniel Lee), your own groups still show normally.
