## A cdesign source is LIVE — re-fetch it before building, not once at intake (2026-08-02)

Fetched `Welcome Week - Header Hierarchy.html` from the Claude Design MCP, saved it to the
task-context dir, and dispatched a reconciler against it. Roughly twenty minutes later Brian pasted
his ongoing conversation with cdesign — and the file had been **edited four times since my fetch**.

What had changed was not cosmetic: the section-rule action buttons were gone entirely, replaced by a
new per-group add-placement rule; the leads-chat control had moved out of the page corner into the
Roles pane; and ~18 selectors had been re-coloured in a contrast pass. The reconciler was producing
a careful SNAP/KEEP manifest for a design that no longer existed.

**Rules:**
- Treat a cdesign project file like a branch tip, not an attachment. **Re-fetch immediately before
  dispatching any build**, even if intake was minutes ago.
- If the user mentions an ongoing design conversation *at all*, re-fetch first and diff before
  responding to anything else.
- When the source changes mid-flight, `SendMessage` the in-flight reconciler with the specific
  deltas rather than letting it finish — it keeps its context and re-diffs cheaply. Overwrite the
  saved copy in the task-context dir so downstream agents can't read the stale one.
- The design file's *rationale* often lives only in the chat, not the artifact. The add-placement
  rule ("an add control must name the list it lands in") was never in the HTML — it was in the
  conversation, and it turned out to be the most reusable thing in the whole handoff. Ask for the
  conversation when the artifact's structure looks arbitrary.
