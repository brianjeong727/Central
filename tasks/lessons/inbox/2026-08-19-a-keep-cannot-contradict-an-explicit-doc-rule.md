## A cdesign KEEP cannot overrule an explicit doc rule (2026-08-19)

Reconciling the open-groups design handoff, the manifest classified its **720px centered
column** as **KEEP** — "the intentional new pattern" — citing `web_design_system.md` §7.0's
allowance that a capped column is legal when centered. I ratified it, built it, and Brian
rejected it immediately: Central is left-aligned and full width, and he considered that a
core principle already established.

He was right, and the doc says so in the same section. §7.0 splits by **content type**:

- *Reading-/form-measure content* (prose, a single-column form, an editorial body) → cap the
  measure and CENTER it. This is the clause the KEEP leaned on.
- *Collection / data content* — "lists of cards, tables, stat grids… **no reading-measure
  constraint** — let them **fill the content area** out to the page padding… **Do not trap a
  list or grid in a fixed narrow column.**"

A list of joinable groups is collection content. The rule was not silent, and it was not
ambiguous — half of it was quoted while the half that governed the actual content type was
not. That is the failure: reading a section far enough to find permission and stopping.

Worse, the mistake compounded. The centered column left the page title orphaned from its
own content, so I spent a whole extra build round "fixing" the alignment of a layout that
should not have existed — and shipped a `SubpageShell` change to serve it. (That change is
independently correct and stays, because genuinely centered surfaces do want a centered
header; it simply had nothing to do with this page.)

**The rule:** a KEEP means "the design system has no opinion here, and this reads as
deliberate." If the doc HAS an opinion, the item is a SNAP no matter how deliberate the
design looks — cdesign does not have standing to overturn a ratified layout rule, and
neither do I. When a handoff and the doc conflict, the conflict itself is the finding, and it
goes to Brian as a question rather than into the manifest as a KEEP.

**Corollary for reconciliation dispatches:** when a manifest cites a doc clause as
permission, quote the WHOLE clause including its sibling cases, and name which case the
surface actually falls under. "§7.0 permits a capped column when centered" was true and
useless; "§7.0 permits it for reading-measure content, and this is a collection" was the
answer.

Related: [[probe-the-service-dont-reason-about-it]] — same family: check what the authority
actually says rather than what a plausible reading implies.
