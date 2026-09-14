# Design pass · Batch 8 — Finance & receipts (N9)

Reviewed 2026-09-14 against the seeded E2E Sandbox, both widths, as treasurer (admin) and as a plain member submitting. 13 captures, 1 reviewer over both widths, re-captured after a seed correction (the first pass flagged the allocation arithmetic as wrong — that was my seed storing expenses negative; the app's own convention is positive, and with correct data the sums reconcile).

---

## The short version

The shape of this area is right, and the arithmetic holds up: funds, categories and the TOTAL all reconcile, the bars are proportional, the ledger chips carry per-category totals. What stands between it and something a ministry would run its books on is which number is biggest, one money formatter, and putting the evidence next to the decision.

- **The fund card answers the wrong question loudest.** The 28px serif figure is what you've *spent*; "how much is left" — the number that decides whether a retreat is affordable — sits at 13px in the top-right corner. A glance reads $1,410.67 as the balance.
- **Nothing makes a receipt auditable.** The photo, the notes and the event name are all marked *(optional)*, so the required submission is an amount and a date; the treasurer's decline reason is optional too. Downstream, Approve and Reject are identical 600px slabs side by side — four of them on a two-split receipt, on money, with no confirm — while the receipt image, the entire basis for approving, is a 180px thumbnail at the bottom below Notes. On a phone the receipt's *name* never appears at all: the treasurer approves $212.30 against "Events" and a note.
- **The step ladder promises money it hasn't moved.** "Reimbursed" fires on the president's sign-off, not on payment; "Submitted" is the only node that never carries a date; "Requested" is unexplained grant jargon. The ministry's own spreadsheet keeps a separate "Reimbursement Confirmation" column precisely because those are different events.

Smaller but real: the three Finance sections render the identical title "Finance" and the identical breadcrumb — only the URL knows which one you're in; the inbox says "10" above a list filtered to five with no date on any row and quick-Approve on two rows but not three, with nothing saying why; money is written in two voices in the same row ("$1,000 spent of $4,0…" beside "$3000.00") and the allocated figure truncates mid-digit; the ledger has no total and no fiscal-year scope while Allocation has both; Allocation is read-only on a phone and doesn't say so.

**Recommendation:** promote "left" to the serif tier and demote spend to the caption. Require a photo (or an explicit "no receipt — explain") and a one-line description, and make that description the receipt's title everywhere — row, breadcrumb, phone headline. Make the receipt image the hero of the detail page, size the approve, and turn reject into a text/outline action that doesn't share a width class with approve. One `formatMoney` for the product. Decide what "Reimbursed" promises — my vote is a fourth node the *submitter* confirms, which is the only option that closes the loop for the person who is out of pocket.

---

## 1. What a person hits

- **Money enters through three unrelated doors** — Receipts workspace → Submit, Finance → Reimbursements (approve), Finance → Budget → Add entry (manual) — and the submit form inherits its category and fund silently from whichever tab you were on, as a mono kicker, not a control. A student on the wrong tab files against the wrong fund with no way to change it in the form.
- **The detail H1 is `$212.30`** at 34/600 — a number with no noun; the thing purchased appears only in the breadcrumb.
- **The ledger's empty copy** points at the retired reimbursement-forms flow.
- **On a phone:** the Finance hub carries no money at all — no balance, no "left this year"; the inbox rows drop the description and the fund pills (who and how much, not what for); Budget is a two-header screen with a desktop button pair floating under the chrome; the three fund cards stack to 810px before the first category row; the Receipts chrome opens at 29px because a wrapper hand-types a top pad; and two plum creates share one screen — an unlabelled "+" that adds a budget *category* sits in the prominent slot while "Submit a receipt", the thing a member came for, is the second plum.

## 2. Design-system findings — by root pattern

- **Four body section-header sizes in one workspace**, all weight 500, none with the mono eyebrow — "Annual Allocation" 21, "Reimbursements inbox" 19, "Categories" 19, "Expense ledger" 15. The instinct is defensible (a 28–36 H2 under a 25px compact title would out-shout its own page); four sizes isn't. Ratify one workspace-section tier and snap all four.
- **A destructive action shares a width class with its primary** in four places (Reject/Approve, Reject/File grant request, Decline/Sign off, Decline/Confirm reimbursed) — two equal slabs on desktop, two half-screen pills on a phone; on the phone Reject is a *filled* ivory pill where the contract requires the outline.
- **Money formatting has no single home** — six sites in one file, grouped and ungrouped, three sign conventions, tabular numerals applied inconsistently, digits truncated.
- **The progress bar fails open on a negative spend** — `pct` is capped at 1 but never floored at 0, so an invalid negative width is dropped by the browser and the bar renders *full*; `remaining` adds a credit back as headroom. The app's own writes are positive, so it's a robustness gap, not a live defect — but a refund or correction would turn the one visual on the screen into a confident lie in the alarming direction.
- **The split cards and the submit sheet are desktop surfaces at phone width** — bordered cream boxes, a raw `<input type="date">` with the browser's calendar glyph.
- **Fractional type throughout the file** (13.5 buttons, 12.5 subtitles, 11.5 ladder labels) and a 9.5px date under a step — the smallest text in the app, and it's a date on money.

## 3. Rules to add or change

**New:** one `formatMoney()` for every currency figure — always grouped, one sign convention, never `$-`, tabular, never truncated. A destructive action is text or outline and sized to its label; only the primary takes the width.

**Change:** the workspace section header tier (see above) — the doc should move.

## 4. Decisions that are yours

1. **What does "Reimbursed" promise?** (a) Keep three nodes, rename the last "Approved to pay". (b) A fourth node the *submitter* confirms ("Got it") — what their spreadsheet's confirmation column did. (c) A fourth node the treasurer marks ("Sent"). Recommendation: (b).
2. **Should a receipt photo be required?** (a) Always. (b) Above a threshold (say $25). (c) Optional, as today.
3. **Does the inbox default to "Needs action" or everything?** Either the title counts what's shown, or the default is All with a Needs-action chip.
4. **Allocation on a phone:** a simple per-category editor sheet plus the TOTAL row, or say plainly "Set allocations on a computer"? Silence is the worst of the three.
5. **Should "Add entry" and "Submit a receipt" be one create with two outcomes?**

## 5. How to look yourself

As admin: Workspace → Finance → Allocation — read the fund cards and say the balance out loud before checking. Then Reimbursements → the Coffeehouse receipt (two splits): find the photo, then find the button you'd press by accident. Then on the phone, the same detail — find the receipt's name. As the sandbox member: Workspace → Receipts → Student Org Board → Submit a receipt — count the required fields.
