// The one place a receipt/allocation status becomes a human label. Every status
// means the same thing regardless of which fund it's on — except `reimbursed`,
// which is reached by two different transitions (app/actions/receipts.ts):
//   church:    signOffAllocation — the president's sign-off is an AUTHORIZATION
//              to disburse; the money has not moved yet → "Approved to pay".
//   external:  confirmExternalReimbursed — the treasurer confirms the grant
//              funder actually paid out → "Reimbursed" is literal here.
// A flat label is false on one of the two paths, so every render site (pills,
// ladders, list/inbox rows, push copy) must pass the fund kind through this
// function instead of reading a status->label map directly.
export type FundKind = "church" | "external"

const BASE_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  requested: "Requested",
  rejected: "Rejected",
  declined: "Declined",
  // Kind-unknown fallback for `reimbursed` (a rollup spanning mixed-kind splits,
  // or a call site with no single allocation to read a kind from) — true under
  // either reading, unlike defaulting to one specific meaning.
  reimbursed: "Approved",
  partial: "Partial",
  flagged: "Flagged",
}

export function statusLabel(status: string, kind?: FundKind): string {
  if (status === "reimbursed") {
    if (kind === "church") return "Approved to pay"
    if (kind === "external") return "Reimbursed"
    return BASE_LABELS.reimbursed
  }
  return BASE_LABELS[status] ?? BASE_LABELS.pending
}
