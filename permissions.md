# Central — Permissions Reference

## Role Hierarchy

Four tiers, stored in `profiles.role`. Always compare with `.toLowerCase()`.

| Tier | Roles | Notes |
|------|-------|-------|
| **Admin** | `admin`, `pastor`, `deacon`, `elder` | Full ministry control. `pastor` additionally sees the Congregation tab. `deacon`/`elder` are excluded from the Plan tab. |
| **Leader** | `leader` | Team leaders (DGLs, Student Org, Praise). Elevated via team membership. Cannot access Settings. |
| **Member** | `member` | Standard membership. |
| **Visitor** | `visitor` | Identical permissions to Member. Badge is outlined to distinguish. |

### Admin sub-roles
All three share the full admin permission tier. Differences are UI-only:
- **Pastor** — also sees the Congregation tab (pastoral oversight of spiritual profiles). Excluded from Plan tab alongside deacon/elder.
- **Deacon / Elder** — excluded from the Plan tab (governance roles, not operational).
- **Admin** (generic) — full access including Plan tab.

### Leader sub-roles
All share the leader permission tier. Capabilities come from team membership, not the role string alone.
- **DGL (Discipleship Group Leader)** — identified by `can_create_dgs` or `can_view_dgs` team permission.
- **Student Org President** — identified by team name matching "student org / board / leadership" or `can_plan_events` permission.
- **Praise Team** — identified by team name matching "praise / worship" or `can_manage_worship_set` / `can_view_worship_set` / `can_manage_schedule` permission.

---

## Permission Matrix

| Feature | Visitor | Member | Leader | Admin |
|---------|:-------:|:------:|:------:|:-----:|
| View announcements | ✓ | ✓ | ✓ | ✓ |
| Create / edit / delete announcements | ✗ | ✗ | ✓ | ✓ |
| RSVP to events | ✓ | ✓ | ✓ | ✓ |
| View RSVP attendee list | ✗ | ✗ | ✓ | ✓ |
| Toggle public attendee visibility | ✗ | ✗ | ✗ | ✓ |
| View chats | ✓ | ✓ | ✓ | ✓ |
| Create DM / personal group chats | ✓ | ✓ | ✓ | ✓ |
| Create church chats | ✗ | ✗ | ✓ (team-based) | ✓ |
| Archive / delete church chats | ✗ | ✗ | ✓ | ✓ |
| View Plan tab | ✗ | ✓ (if on a team) | ✓ | ✓ (except deacon/elder) |
| Create teams | ✗ | ✗ | ✓ (DGL/praise) | ✓ |
| View directory | ✓ | ✓ | ✓ | ✓ |
| View giving info (Zelle) | ✓ | ✓ | ✓ | ✓ |
| Edit giving info | ✗ | ✗ | ✗ | ✓ |
| View reimbursement forms | ✗ | ✗ | ✓ (assigned DGLs) | ✓ |
| Submit / edit reimbursement forms | ✗ | ✗ | ✓ (assigned DGLs) | ✓ |
| View budget | ✗ | ✗ | ✓ (treasurer permission) | ✓ |
| Access Settings tab | ✗ | ✗ | ✗ | ✓ |
| Edit ministry name / university | ✗ | ✗ | ✗ | ✓ |
| Toggle ministry public/private | ✗ | ✗ | ✗ | ✓ |
| Change member roles | ✗ | ✗ | ✗ | ✓ |
| Remove members | ✗ | ✗ | ✗ | ✓ |
| Regenerate member invite code | ✗ | ✗ | ✗ | ✓ |
| Regenerate staff invite code | ✗ | ✗ | ✗ | ✓ |
| Manage schools | ✗ | ✗ | ✗ | ✓ |
| Manage receipt limits | ✗ | ✗ | ✗ | ✓ |
| Archive ministry | ✗ | ✗ | ✗ | ✓ |
| View Congregation tab | ✗ | ✗ | ✗ | Pastor only |

---

## Join Codes

| Code | Who can use | Role assigned on join |
|------|------------|----------------------|
| **Member invite code** | Anyone (private ministries only) | `member` |
| **Staff invite code** | Pastors, deacons, elders | Chosen during join flow: `pastor` / `deacon` / `elder` |

Public ministries have no member invite code — anyone joins via browse. Both ministry types always have a staff invite code.

If an admin-tier person accidentally joins via the member path, an existing admin can promote them in Settings → Members.

---

## Key Implementation Constants

These arrays must be kept in sync across all files:

```
Admin tier:  ["admin", "deacon", "elder", "pastor"]
Leader tier: ["admin", "deacon", "elder", "pastor", "leader"]  ← for leader-and-above checks
```

**Locations that use the admin-tier array:**
- `app/home/home-app.tsx` — `isAdmin` flag (gates Settings tab, team creation, church chat creation)
- `app/home/tabs/settings-tab.tsx` — `isAdmin` flag (gates all settings edit controls)
- `app/actions/ministry.ts` — server-side guard on every ministry mutation
- DB function `auth_is_admin_or_leader()` — used in 30+ RLS policies

**Locations that use leader-and-above:**
- `app/home/tabs/announcements-tab.tsx` — `isLeaderOrAdmin`
- `app/home/tabs/chats-tab.tsx` — `isAdminOrLeader`
- `app/actions/chat.ts` — group deletion guard
- DB function `auth_is_admin_or_leader()` — also covers leaders for announcements, teams, etc.

---

## Plan Tab Visibility Rules

```
showPlanTab = NOT (deacon OR elder) AND (isAdmin OR hasTeams)
```

| Role | Sees Plan tab |
|------|:------------:|
| visitor / member | Only if on a team |
| leader | Only if on a team |
| admin (generic) | ✓ always |
| pastor | ✓ always |
| deacon | ✗ never |
| elder | ✗ never |

---

## Reimbursements / Finance Access

Finance access uses **team permissions** on top of the role tier:

| Who | Access |
|-----|--------|
| Admin tier | Full access: all forms, budget, allocation |
| `can_view_finances` permission (treasurer) | Full read + submit access |
| Assigned DGL on a form (`assigned_dgl_ids`) | View + edit their own assigned forms only |
| Everyone else | No access |

---

## Congregation Tab

Visible only to users with role `pastor`. Shows:
- Congregation question management
- Member spiritual profiles (bible verse, prayer requests, etc.)

---

## RLS Enforcement

All permissions are enforced at two layers:
1. **UI** — components check role flags before rendering controls
2. **Database RLS** — Supabase policies enforce the same rules server-side

The DB function `auth_is_admin_or_leader()` (SECURITY DEFINER) is the central RLS primitive. It returns `true` for roles: `admin`, `leader`, `deacon`, `elder`, `pastor`.

`auth_ministry_id()` returns the current user's `ministry_id`, used to enforce tenant isolation on every policy.
