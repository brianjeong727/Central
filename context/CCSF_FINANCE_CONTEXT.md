# CCSF Finance Context — 2025–26 Season (real-world treasurer workflow)

> Distilled 2026-07-19 from the "Finance 25-26" Google Drive that the two CCSF
> treasurers (Pitt + CMU) and the finance deacon actually used to run church + school
> money for the 2025–26 year. Companion to `CCSF_CONTEXT.md` (which covers the board
> at large). This doc is the source of truth for how reimbursements, funding sources,
> and the budget ledger REALLY work — reference it when designing Central's Finance
> workspace, Receipts workspace, treasurer role, and budget model. Contact info and
> account/P-card numbers live in the original Drive, not here.

## Who runs finance (roles & access)

- **Two treasurers, one per campus.** 2025–26: **Brian Jeong (Pitt)** and **Joshua Lee (CMU)**.
  Historically CCSF always splits finance by campus because the funding pipelines are
  campus-specific (Pitt SGB vs. CMU JFC). 2026–27 continues this (Emily Kim, Daniel Kim).
- **Division of labor (from the finance notes):**
  - **Brian → Pitt + Church finances.** DG dinners, Praise & Prayer, and other church
    events; Pitt funding focused on the *excess* money needed for large events + extras
    like sports.
  - **Josh Lee → CMU finances.**
- **Finance deacon = READ-ONLY.** An oversight role — sees the whole Drive/ledger but
  doesn't file or approve. (This is the real-world "sign-off / audit" tier.)
- The Drive was the shared workspace: a master budget sheet, a reimbursement-form
  template, filled reimbursement PDFs, and receipt images filed by event.

## The core mental model: THREE funding sources per expense

Every dollar spent is charged to one of three "funds" — and a single purchase can be
**split across more than one**:

| Fund | What it is | How you get it |
|---|---|---|
| **CMU** | CMU student-org allocation | JFC operating budget, TartanConnect, P-card, Authorized-Signer training |
| **Pitt** | Pitt student-org allocation | SGB Allocations + grants (see below), SORC purchasing / P-card |
| **Church** | Central Church general funds | Reimbursed directly by the church treasury |

**The eligibility rule that drives everything:** university money (CMU/Pitt) generally
requires the event be **open to the whole campus, advertised, on-campus, no admission
fee, and not member-only.** So:
- **Member-only / internal events → Church funds.** DG dinners, membership flowers,
  appreciation nights (SAN/GAN) can't be university-funded.
- **Big open events → University funds first, Church covers the remainder.** Welcome
  Night, Coffeehouse, Turkeybowl, SAN/SSO socials, EM/KM Praise Night.

The treasurer's real skill is **routing each expense to the right source to maximize
free (university) money and minimize church spend** — including splitting one receipt
across two funds and even shuffling small amounts between funds to hit an allocation
cap cleanly (see the ledger note below).

### Pitt funding mechanisms (from `Pitt Funding Methods.docx`)
- **SGB Allocations** — ask any amount, ideally < $2,000; needs an SGB liaison; must be
  a SORC-registered org. `sgb.pitt.edu/allocations`.
- **SGB DEI Committee Grant ($500)** — furthers diversity/equity/inclusion; itemized list
  required; **no gift cards, no donations**; if collaborating, SORC deposits to only ONE
  org; funds take a while → apply well before the event.
- **Late-Night Mini-Grant ($1,500)** — substance-free late-night social/rec, **open &
  advertised to undergrads, on-campus, no fees**, evening/night (ideally Fri/Sat 8:30–11:30 PM);
  apply ≥2 weeks before (never <1 week).
- **OCC Mini-grant ($300)** — must post the event on Suitable.
- **Donated Food Services** (Pepsi + food) — request ≥2 weeks ahead, pickup only, at their
  discretion, not for member-only or public events; can't be sold; no alcohol at the event.
- **SORC Purchasing / P-card** — direct-purchase path (avoids reimbursement).

### CMU funding mechanisms (from `Important Notes for CCSF Finance.docx`)
- **JFC Operating Budget** — due ~09/07; built on TartanConnect.
- **Authorized Signer Training**, **Tier C upgrade requirements**, **FY25/FY26 JFC Best
  Budget Spending Practices** — prerequisites the CMU treasurer completes at year start.

## The master ledger (`CCSF Budget Sheet _25-26`)

One shared spreadsheet, **one row per line-item purchase** (not per event). Columns:

`Week | Event | Event Date | Description | Amount | Purchase Date | Purchaser | School | Requested from CMU | Requested from Pitt | Requested from Church | Status | Reimbursement Confirmation | Notes`

Mechanics that matter:
- **Purchaser** = the board member who fronted the money out of pocket → the person who
  gets reimbursed. Every week's DG dinner has a *different* purchaser (a rotation).
- **School** = which campus the purchaser belongs to (Pitt/CMU) — routing hint, not
  necessarily the funding source.
- **Amount is split across the three "Requested from …" columns.** A single $111 pizza
  purchase was $40 from CMU + $71 from Church. This split is the heart of the model.
- **Status** is freeform in practice: `Pending`, `Approved`, `Have Not Done`, and hybrids
  like *"Yes from Church, waiting from CMU."*
- **Reimbursement Confirmation** is a separate column: `Reimbursed` / `Not Yet`. (Approval
  and actual cash-back are tracked independently.)
- **Notes carry the funding strategy.** Real example: *"Get reimbursed by CMU, then rest
  from Church. We originally got reimbursed $71.17 from church. But if we move $7 to CMU
  it's closer to the amount, so we'll send back the $7 as offering when we get it
  reimbursed from CMU. This way we can write $64.17 instead of $71.17."* — treasurers
  actively juggle cents across funds.

**Side summary block** (same sheet): per-event cost rollups split by source (CMU/Pitt/
Church), per-event **CMU budget allocation vs. actual spend** ("How much we spent" /
"Left from CMU" / "Left from Church"), and special line items — Turkeybowl **189 shirts
for $1,528 sold at $10 each** (excess → water/Gatorade), Venmo fee, leftover, trophies,
pizza. There's also a per-event **budget-estimate sheet** (e.g. `Women's Retreat Budget
Sheet`) used to plan/propose an event's budget *before* spending — same column shape,
used as a proposal.

## The reimbursement form (`Original Form.pdf`)

Central Church–branded one-page PDF. Fields:
- **Name**, **Date**
- **Expense Purpose** (e.g. "DG Dinner 2/13/2026" — includes the event date)
- **Itemized Expenses** table: `Date | Description | Cost` (up to ~11 rows) with an
  auto **Total**
- "*Don't Forget to Attach Receipt*"
- **Notes**
- **Signature** (submitter) + **Approval Print Name** + **Approval Signature** (approver)
- **Record Number** — "Accounting Purpose Only (Do Not Fill In)"

**Reality check:** in the filed/reimbursed PDFs, the submitter fills the items and signs,
but the **Approval Print Name / Approval Signature fields are usually left blank.** The
"approved & reimbursed" state is tracked by **moving the PDF into the `Reimbursed/`
folder** + marking the master sheet — not by a signature on the form. The approval
signature line is aspirational, not enforced.

## The end-to-end manual pipeline

1. A board member spends their **own money** at an event; keeps the receipt (phone photo
   or PDF).
2. Fills a **Reimbursement Form PDF** (one per event/purchase), attaches the receipt image(s).
3. Drops it in the shared Drive under `Reimbursement Forms/`.
4. **Treasurer logs it** in the master sheet, **decides the funding source(s)**, and
   applies to the school (SGB/JFC) and/or requests from the church.
5. When the money comes back, treasurer marks **Reimbursed** and **moves the PDF to
   `Reimbursed/`**; receipts are also archived by event under `Receipts (PDFs)/<Event>/`.
6. Finance deacon can see everything for oversight.

## What the receipts actually look like

- Formats are **messy**: `.HEIC`, `.JPG`, `.JPEG`, `.PNG`, `.PDF` — raw phone photos,
  inconsistent naming (`zDinner ($19.25).JPG`, `DG Dinner 9_212_2025.pdf`).
- Filed manually into event folders (`DG Dinners/Fall Semester/9-19-25/…`,
  `SSO/Decor/…`, `Welcome Night/…`). A single event can have many receipts across
  sub-categories (SSO → Decor / Food / Games / Gifts).

## Real event → funding pattern (2025–26 actuals)

| Event | Typical funding | Notes |
|---|---|---|
| **DG Dinner** (weekly, biggest volume) | **Church** | ~$90–190 groceries each Friday; rotating purchaser |
| **Welcome Night** | CMU (mostly) + Church | ~$209 total; gifts/decor/food split |
| **Coffeehouse** | CMU + Church split | pizza for volunteers split $40 CMU / rest Church |
| **Turkeybowl** | Self-funded via shirt sales + Pitt | $1,528 shirts recouped at $10 each |
| **SAN / SSO** (appreciation / send-off) | CMU allocation (per-event cap) | tracked vs. allocation |
| **Membership flowers** | **Church only** | universities won't fund member-only |
| **EM/KM Praise Night** | Church (+ partial) | joint event |

## Glossary (finance-specific; see CCSF_CONTEXT.md for the rest)
- **SGB** — Pitt Student Government Board (allocations + grants)
- **SORC** — Pitt Student Organization Resource Center (registration, P-card, purchasing)
- **JFC** — CMU Joint Funding Committee (student-org operating budgets via TartanConnect)
- **P-card** — university purchasing card (buy directly, skip reimbursement)
- **Authorized Signer** — CMU role trained to approve org spending
- **Fund / Source** — which of CMU / Pitt / Church pays for a given expense
- **Purchaser** — the person who fronted the money and is owed the reimbursement
