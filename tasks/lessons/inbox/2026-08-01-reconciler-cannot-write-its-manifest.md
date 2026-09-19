# The reconciler is read-only but the doctrine tells it to write its manifest

**What happened.** Dispatched `reconciler` on a cdesign handoff and told it — per
`orchestration/orchestrated.md` §"Artifact protocol" — to write its full manifest to
`.claude/task-context/<slug>/manifest.md` and return only a ≤10-line summary plus the path.
It couldn't: `.claude/agents/reconciler.md` grants `tools: Read, Grep, Glob`. It correctly
refused to return a path to a file it hadn't created and dumped the whole manifest into its
reply instead — which is exactly the "three degraded copies" failure the artifact protocol
exists to prevent, and it burned the reply budget the protocol was meant to protect.

**Why it matters.** The artifact protocol is stated as universal ("Agents write their FULL
output there as a named file") but three of the six agents are read-only by design —
`reconciler`, `explorer`, and `enforcer` all have Read/Grep/Glob-only grants. The protocol
and the agent definitions contradict each other for exactly those three.

**How to apply.** When dispatching a READ-ONLY agent (`reconciler`, `explorer`, `enforcer`,
and `rls-reviewer` in its static mode), do NOT ask it to write an artifact file. Ask for the
full output in its reply and have the MAIN SESSION persist it to the task-context dir. Only
`engineer` (and `tester`, for its own reports) can honour the write-the-artifact instruction.

Candidate fix to propose at the next `/lessons-gc` or doc pass: amend the artifact protocol in
`orchestrated.md` to split the rule — write-capable agents self-persist; read-only agents
return and the coordinator persists. Alternatively give the read-only agents a Write grant
scoped to `.claude/task-context/**`, which keeps the protocol uniform, but that weakens the
"read-only" guarantee that makes them safe to run on unfamiliar code.
