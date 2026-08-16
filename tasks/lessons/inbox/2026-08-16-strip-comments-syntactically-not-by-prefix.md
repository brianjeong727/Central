## A lint gate that "ignores comments" by line prefix will leak — strip them syntactically (2026-08-16)

`scripts/check-chrome-title.sh` decides a file "builds a chrome row" by looking for
`POCKET_CHROME_PAD_Y`, and tries to ignore files that merely NAME the constant in
prose by dropping lines whose prefix is `*`, `//` or `/*`.

I wrote a JSX comment explaining why a wrapper has no `paddingTop`, and wrapped it
onto a second line:

```jsx
{/* NO paddingTop — the chrome row owns the gap below the title
    (POCKET_CHROME_PAD_Y, Convention #27). This carried `showStats ? 0 : 24`, */}
```

The second line starts with `(`. No prefix, so the filter read it as code and a
**BLOCKING** gate failed `verify.sh` on a comment. This is the SECOND leak of the same
kind — the script's own comment records the first (`" * …"` block continuations, which
have no slash). Prefix-matching cannot express "is this inside a comment," because
comment-ness is a property of the enclosing construct, not of the line.

Fixed by stripping comments syntactically before the grep — perl slurps the file,
removes `/* … */` (which covers JSX `{/* … */}`) and `//` tails, then greps what is
left:

```bash
perl -0777 -ne 's{/\*.*?\*/}{}gs; s{//[^\n]*}{}g; exit(/TOKEN/ ? 0 : 1)' "$f"
```

**Two rules.** (1) Any checker that must "skip comments" strips them as constructs,
never by line prefix — one-line comments and block continuations are different shapes
and a prefix list will always be one shape behind. (2) When you change a detector,
prove BOTH directions before moving on: that the false positive is gone AND that a
genuine violation still fails. I wrote a throwaway `components/__chrome_probe.tsx`
that hand-rolls a chrome row, confirmed it still exits 1, and deleted it. A detector
"fixed" by loosening it until the current file passes is a disabled detector.

Corollary, since I nearly did the wrong thing first: the cheap escape was to reword my
comment so the token moved. That is fixing the threshold, not the detector — the exact
move Convention #27 forbids — and it leaves the next person to trip the same gate.

Related: [[enforce-the-type-not-just-the-position]] (the convention this gate enforces).
