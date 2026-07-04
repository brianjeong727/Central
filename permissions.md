# Central — Permissions Reference

## Role Hierarchy

Four tiers, stored in `profiles.role`. Always compare with `.toLowerCase()`.

| Tier | Roles | Notes |
|------|-------|-------|
| **Admin** | `admin`, `pastor`, `deacon`, `elder` | Full ministry control. `pastor` additionally sees the Congregation tab. |
| **Leader** | `leader` | Elevated via team membership (DGLs, Student Org, etc.). Cannot access Settings. |
| **Member** | `member` | Standard membership. |
| **Visitor** | `visitor` | Identical permissions to Member. Badge is outlined to distinguish. |

### Admin sub-roles
All four share the full admin permission tier. Differences:
- **Pastor** — also sees the Congregation tab (pastoral oversight of spiritual profiles).
- **Deacon / Elder / Admin** — full access. **Note:** deacon/elder are **no longer excluded from Plan** — Plan now shows for anyone on a team or holding governance (see Plan Tab Visibility).

### Team identity
Team behavior is resolved by a single classifier, `app/home/team-type.ts` `classifyTeam(team)` → `finance | dgPraise | oneTime | studentOrg | dgl | praise | tech | standard`, **by `team_type` first, then name regex — never by permission**. (Permission-based type detection caused the Finance-mis-classified-as-StudentOrg bug.) Do not re-introduce name/permission guesses for *type*; classify, then check capability.

---

## The two permission planes

The model has two independent planes — keep them distinct:

1. **Domain write** ("do the team's work" — edit the budget, build the setlist, approve a receipt). Requires **team membership + a team role permission**. There is NO role-based default; being an admin does not grant domain write.
2. **Governance** ("run/oversee a team" — create it, manage its roster, edit its settings, delete it, and read/view its content). An **admin** power. Viewing or running a team never makes you a member.

---

## Governance model

### Who holds governance — the roster
- A **global governance roster** lives in church settings. Defaults to **all admin-tier users**. Toggle it off to curate a roster of specific admins. Roster = who governs, ministry-wide. (`ministries.governance_settings = { all_admins, roster_ids }`; `governance.ts` `isGovernanceAdmin`.)

### What they get, per team — the matrix
- A **per-team admin matrix** (church settings) gives governance-admins **none / view / write** on each team. Default **write** (DB column default and all code fallbacks are `write`).
  - `none` — locked out; only the team's own members manage it.
  - `view` — read content (read-only) **+ govern structure** (manage roster, edit team settings, delete the team).
  - `write` — `view` + **domain write** (act on the team's work without being a member).
- Roster (who) **×** matrix (what) compose. (`teams.admin_access`; `governance.ts` `teamAccessLevel` → `member | gov-write | gov-view | none`.)

### Team settings-page access
= governance-admins with **view+** on that team **+** the team's **president(s)**. NOT regular members.

### Anti-lockout
Church **Settings** (where the roster + matrix live) stays open to **all admin-tier** regardless of the governance roster, so a ministry can never lock itself out of its own controls.

---

## Teams

- **Preset teams only** for now (Small Group Leaders, Student Org Board, Finance). Custom team creation is not built ("New team · coming soon").
- **Universal president:** creating any team requires appointing a president; a team is born with ≥1 member (the president). `team_roles.is_president` (explicit flag, not name-matched).
- **Co-presidency:** a per-team setting (`teams.allow_co_presidency`). When on, exactly **2** presidents are required. Adding a 3rd president is blocked; changing a president uses a "Replace a president?" flow.
- **Admins can't be team members by default:** `teams.allow_admin_members` (default false). Admin-tier users are excluded from member/president pickers unless a team enables it. (Governance separation — admins govern from outside.)

---

## Plan Tab Visibility

```
showPlanTab = userTeams.length > 0 || isGovernanceAdmin
```

| Role | Sees Plan tab |
|------|:------------:|
| visitor / member / leader | Only if on a team |
| deacon / elder | Only if on a team **or** holds governance |
| admin / pastor | ✓ (governance-admin by default) |

The Plan picker ("Which workspace are you entering?") groups: **Workspaces** (your member teams + the Receipts workspace) and **Admin access** (teams you govern but aren't a member of — view-only or can-edit per the matrix).

---

## Finance (a Plan team)

Finance is **no longer a top-level tab** — it's a Plan team (`team_type='finance'`). Member-facing **Give** (Zelle) is a separate Home tab, congregation-wide and ungated.

- **Roles: President + Member only.** President (the finance deacon) signs off reimbursements; Members (the treasurers operate + approve; plus any overseeing admins). No auto-add — the admin appoints the president like any other team.
- **Budget / allocation / category edits:** allowed for a Finance-team member with `can_view_finances` **or** admin-tier. Enforced server-side in `app/actions/finance-auth.ts` (`getFinanceCapability`) — the budget-write actions (`upsertBudgetAllocation`, `addBudgetCategory`, `deleteBudgetCategory`) reject unauthorized callers.
- All admins retain **view-only** access to Finance (and every workspace) via governance by default.

---

## Receipts & reimbursements

The DG-dinner `reimbursement_forms` flow is **retired** — replaced by free-form receipts.

- **Submit:** any team member opens the **Receipts** workspace (in Plan), picks a team → a per-team **category** → submits a receipt (inherits the category + fund). Categories are per-team; any team member can add one (`receipt_categories`, team-membership RLS).
- **Approval chain** (Finance → Reimbursements inbox):
  | Step | Who | Transition |
  |------|-----|-----------|
  | Submit | any team member | → `pending` |
  | Approve / Reject | **Treasurer** (Finance member w/ `can_view_finances`, or admin-tier) | `pending` → `approved` / `rejected` |
  | Sign off / Decline | **Finance President** (`is_president` on the finance team, or admin-tier) | `approved` → `reimbursed` / `declined` |
  All transitions are server-authed + state-guarded (`app/actions/receipts.ts` via `finance-auth.ts`).

---

## Permission Matrix

| Feature | Visitor | Member | Leader | Admin |
|---------|:-------:|:------:|:------:|:-----:|
| View announcements / RSVP | ✓ | ✓ | ✓ | ✓ |
| Create/edit/delete announcements | ✗ | ✗ | ✓ | ✓ |
| View RSVP attendee list | ✗ | ✗ | ✓ | ✓ |
| View chats | ✓ | ✓ | ✓ | ✓ |
| Create church chats | ✗ | ✗ | ✓ (team-based) | ✓ |
| View Plan tab | on a team | on a team | on a team | ✓ (or governance) |
| View directory | ✓ | ✓ | ✓ | ✓ |
| View Give (Zelle) | ✓ | ✓ | ✓ | ✓ |
| Edit Give info | ✗ | ✗ | ✗ | ✓ |
| Submit a receipt | on a team | on a team | on a team | on a team / governance |
| Approve / reject a receipt | ✗ | Finance member (`can_view_finances`) | ✗ | ✓ |
| Sign off / decline a receipt | ✗ | Finance president | ✗ | ✓ |
| Edit budget / allocation | ✗ | Finance member (`can_view_finances`) | ✗ | ✓ |
| Govern a team (roster/settings/delete) | ✗ | ✗ | ✗ | per matrix (view+) |
| Domain-write a non-member team | ✗ | ✗ | ✗ | per matrix (write) |
| Access Settings tab | ✗ | ✗ | ✗ | ✓ |
| Edit ministry / roles / members / codes / schools | ✗ | ✗ | ✗ | ✓ |
| View Congregation tab | ✗ | ✗ | ✗ | Pastor only |

---

## Join Codes

| Code | Who can use | Role assigned on join |
|------|------------|----------------------|
| **Member invite code** | Anyone (private ministries only) | `member` |
| **Staff invite code** | Pastors, deacons, elders | Chosen during join: `pastor` / `deacon` / `elder` |

Public ministries have no member invite code (join via browse). If an admin-tier person joins via the member path, an existing admin can promote them in Settings → Members.

---

## Key Implementation Constants

Role-check arrays (keep in sync across files — see CLAUDE.md Convention #2):
```
Admin tier:        ["admin", "deacon", "elder", "pastor"]
Leader-and-above:  ["leader", "admin", "deacon", "elder", "pastor"]
```
Finance/governance capability is NOT a role-array check — it routes through:
- `app/actions/finance-auth.ts` — `getFinanceCapability` / `computeFinanceCapability` (can-approve = finance member w/ `can_view_finances` OR admin-tier; can-sign-off = finance president OR admin-tier). Single source of truth for receipt transitions + budget writes.
- `app/home/governance.ts` — `isGovernanceAdmin`, `teamAccessLevel`.
- `app/home/team-type.ts` — `classifyTeam`.

---

## RLS Enforcement

Two layers: UI flags + Supabase RLS. Central primitives (SECURITY DEFINER):
- `auth_is_admin_or_leader()` — `true` for `admin`/`leader`/`deacon`/`elder`/`pastor`.
- `auth_ministry_id()` — tenant isolation on every policy.
- `auth_is_admin_or_leader()` + the `governance_settings`/`admin_access` columns back governance; `receipt_categories` writes gate on team membership; receipt/budget server actions gate via `finance-auth.ts`.

**Deferred to merge:** the hard DB enforcement triggers (max-president-count per team, governance write RLS) are intentionally NOT yet applied — the prod DB is shared with `main`, so they go in as the merge step to avoid breaking `main`'s live flows.
