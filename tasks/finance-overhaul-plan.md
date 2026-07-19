# Finance Overhaul — Build Plan

> Drafted 2026-07-19 from the CCSF finance-drive analysis (`context/CCSF_FINANCE_CONTEXT.md`)
> and the current-state report. Goal: make Central's finance model match how treasurers
> actually work — funds that split across sources, each with its own reimbursement timeline.
>
> **Decisions (locked with Brian):** phased (spine first) · full split + per-source status ·
> president signs off + read-only auditor role.

---

## Phase map

| Phase | Theme | Ships |
|---|---|---|
| **P1 — Spine** | Funding-source model + correctness | Configurable per-ministry funds, split-per-source with independent status, read-only finance role, HEIC + multi-image receipts |
| **P2 — Ledger parity** | Make it replace the master sheet | Event linkage (FK to calendar_events), per-event budget vs actual, per-event budget proposals, branded PDF reimbursement-form export, CSV parity |
| **P3 — Grants** | Model the university pipelines | Grant/application tracker (SGB, JFC, mini-grants) with caps, deadlines, eligibility hints |

Everything below details **P1**. P2/P3 are scoped at the bottom.

---

## P1 — The spine (funding-source model + correctness)

### The model shift

Today a receipt is one row: one `fund` string, one `amount`, one `status`. Reality: one
expense is **split across funds**, and each split has its **own reimbursement timeline**
(Church pays fast; a university grant takes weeks). So we make the money live in child
**allocation** rows and turn funds into a per-ministry configurable list.

```
receipt (header: submitter, event, purchase_date, notes, images, total)
  └── receipt_fund_allocation × N
        Church  $71.00  [approved → reimbursed]   (treasurer + president)
        CMU     $40.00  [requested → reimbursed]   (treasurer files grant → paid)
```

### Schema (via Supabase MCP — `apply_migration`, NOT files)

**New table `finance_funds`** (replaces the hardcoded `church/cmu/pitt` array)
| col | type | notes |
|---|---|---|
| id | uuid pk | |
| ministry_id | uuid fk | |
| name | text | "Church", "CMU", "Pitt" |
| slug | text | stable key; `church`/`cmu`/`pitt` preserved for CCSF back-compat |
| kind | text | `church` \| `external` — drives the status lifecycle + which actions show |
| order_index | int | |
| is_active | bool | default true |
| created_by / created_at | | |
- UNIQUE(ministry_id, slug).

**New table `receipt_fund_allocations`** (the split rows — mirrors the master sheet's "Requested from X")
| col | type | notes |
|---|---|---|
| id | uuid pk | |
| receipt_id | uuid fk → receipts (ON DELETE CASCADE) | |
| ministry_id | uuid fk | defense-in-depth |
| fund_id | uuid fk → finance_funds | |
| amount | numeric | |
| status | text | `pending`\|`approved`\|`requested`\|`reimbursed`\|`rejected`\|`declined` |
| requested_at | timestamptz | when treasurer filed the external application |
| reviewed_by / reviewed_at | | treasurer approve/reject |
| signed_off_by / signed_off_at | | president sign-off (church kind) / treasurer confirm-paid (external) |
| decision_reason | text | reject/decline note |
| created_at | | |

**Status lifecycle by fund kind:**
- `church`: `pending` → **approved** (treasurer) → **reimbursed** (president sign-off). Terminal: `rejected` (treasurer), `declined` (president).
- `external`: `pending` → **requested** (treasurer files SGB/JFC application) → **reimbursed** (treasurer confirms money received). Terminal: `rejected` (treasurer), `declined` (grant denied).

**Column adds (keep old columns during transition):**
- `receipts.receipt_image_urls text[]` — multi-image. Keep `receipt_image_url` as `[0]` for back-compat.
- `receipt_categories.fund_id uuid`, `receipt_limits.fund_id uuid`, `ministry_budgets.fund_id uuid` — FK alongside the existing `fund` string (dual-write during transition, then drop strings in a later cleanup migration).

**Receipt-level `status`** becomes **derived** (rollup of its allocations): `reimbursed` when all allocations reimbursed, `pending` if any pending, else `partial`. Keep the column, recompute on allocation writes so existing reads don't break.

### Backfill migration (idempotent)
1. Seed `finance_funds` per ministry: a **"Church"** fund for every ministry; add **CMU** + **Pitt** for Central/CCSF (and any ministry with rows referencing those slugs).
2. For each existing `receipt`: insert **one** `receipt_fund_allocation` mirroring `fund`→`fund_id`, `amount`, `status`, and the audit fields.
3. Backfill `fund_id` on `receipt_categories` / `receipt_limits` / `ministry_budgets` from their `fund` slug.
4. Backfill `receipt_image_urls = ARRAY[receipt_image_url]` where non-null.

### RLS (rls-reviewer MANDATORY — before design review + after live probes)
- `finance_funds`: SELECT = ministry members (`auth_ministry_id()`); INSERT/UPDATE/DELETE = restrictive (writes only via server action w/ service role + `computeFinanceCapability`), mirroring the existing receipts write pattern.
- `receipt_fund_allocations`: SELECT = finance viewers **or** the receipt's `submitted_by` (own receipts); writes via server action only.
- Every policy uses `auth_ministry_id()` / SECURITY DEFINER helpers — never a raw `profiles` subquery (Convention #9).

### Server actions
`app/actions/finance-auth.ts`
- Add **`canView`** to `FinanceCapability`: true if `canApprove || canSignOff || admin || role-perm can_audit_finances`. New permission string **`can_audit_finances`** = read-only oversight (the finance deacon).

`app/actions/receipts.ts` (redesign around allocations)
- `submitReceipt` — creates the receipt header + **one default allocation** (suggested fund, default the ministry's Church fund). Multi-image param.
- **`setReceiptAllocations`** — treasurer sets/edits the split (validate Σ allocations == receipt total; `can_view_finances`).
- Per-allocation transitions (each gated + status-guarded): `approveAllocation`, `rejectAllocation` (treasurer); `signOffAllocation`, `declineAllocation` (president, church kind); `requestExternalAllocation`, `confirmExternalReimbursed` (treasurer, external kind).
- Recompute the receipt rollup status inside each transition.

`app/actions/finance-funds.ts` (new) — CRUD for the per-ministry fund list (finance-manage gated).

### UI
- **SubmitReceiptModal** (`finance-workspace.tsx`): funds come from `finance_funds` (not the hardcoded array); **multi-image upload**; **HEIC→JPEG convert on upload** (add `heic2any` via **pnpm** — Vercel frozen-lockfile, per memory). Member enters the total + optionally suggests a fund; the treasurer owns the split.
- **Reimbursements inbox** (`finance-workspace.tsx`): each receipt expands to its **allocation split**; per-source **status chips**; actions rendered **per allocation, gated by fund kind** (church → Approve/Sign-off; external → Mark requested/Mark reimbursed). Read-only viewers (`canView` only) see the data, **no action buttons**.
- **Receipts workspace detail** (`receipts-workspace.tsx`): show the split + a per-source status stepper (Submitted → Approved/Requested → Reimbursed).
- **Allocation grid**: dynamic fund columns from `finance_funds`.
- **Settings → receipt limits** (`settings-tab.tsx`): replace the `{church,cmu,pitt}` label map with the fund list; limits keyed by `fund_id`.

### Permissions / role model
- `workspace-presets.ts` Finance team preset gains a **"Finance Deacon"** role with `can_audit_finances` (view-only). Existing: Treasurer (`can_view_finances`, approve) + President (`is_president`, sign-off).
- Update `permissions.md` + `lib/roles.ts` notes if any predicate touches finance (likely none — finance is team-permission driven, not ministry-role driven). **Doc edit needs approval per CLAUDE.md Capture rule.**

### Verify (testing skill + sandbox mandate)
- Seed **Brian's Sandbox**: a Finance team with treasurer + president + deacon, funds Church/CMU/Pitt, a member-submitted receipt, treasurer split ($X church + $Y CMU), church→sign-off, CMU→requested→reimbursed. Leave fixtures. Hand back a "How to test it yourself" (rows + IDs + click path).
- E2E click-through of the split-approval flow; `npm run build` green; enforcer at Tier 2 (permission semantics + multi-viewport).

### P1 risks / notes
- **Back-compat:** dual-write `fund`/`fund_id` and keep `receipt_image_url` until a later cleanup migration — don't drop columns in P1.
- **Split total invariant:** server-side guard Σ(allocation.amount) == receipt.amount; reject otherwise.
- The removed hardcoded `FUNDS` array is referenced in `finance-workspace.tsx` **and** `settings-tab.tsx` — migrate both call sites together (component-level, Convention #4).

---

## P2 — Ledger parity (scoped, not detailed yet)
- **Event linkage:** `receipts.calendar_event_id` FK → `calendar_events` (replace free-text `event_name`); enables reliable per-event rollups.
- **Per-event budget vs actual** + **pre-event budget proposals** (the Women's-Retreat estimate-sheet pattern): new `event_budgets` (estimate lines) rolled up against actual allocations.
- **Branded PDF reimbursement-form export** (the retired `reimbursement_forms` flow, revived): generate the Central Church itemized PDF from a receipt for church accounting; wire `reimbursement_form_id`.
- **Itemization:** line items within a single reimbursement (`receipt_line_items`).
- **CSV export parity:** carry the per-source split + reimbursement-confirmation columns so it can replace the master sheet.

## P3 — University grant tracker (scoped)
- `finance_grants` per external fund: application state, cap, deadline, event link, eligibility flags.
- Eligibility hinting (member-only event → church-only; open/advertised → university-eligible).
- Optional: per-campus treasurer assignment + routing (report gap #4) — funds already capture CMU/Pitt, so this is assignment/notification, not model.

---

## Open questions to resolve before P1 build
1. Does the member ever pick the split, or is it **always** treasurer-assigned? (Plan assumes treasurer-owned; member only suggests.)
2. Should external allocations require **president sign-off** too, or is the external body the sole approver? (Plan: external skips president.)
3. Fund list — ship a **default "Church"-only** list for new ministries and let admins add funds in Settings? (Plan: yes.)
