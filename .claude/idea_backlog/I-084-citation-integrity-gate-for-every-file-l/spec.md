---
title: "Citation-integrity gate for every file:line reference into canon.md and the A-docs"
id: I-084
status: idea
origin: F-035
---

# I-084 — line citations rot silently on any insert

## Problem

The worldbuilding corpus cites world law by **line number** (`canon.md:254`, `A0:337`). Any
insert above a cited line silently invalidates it. This has now happened three times:

- **I-051** shifted `canon.md` and `A0` and had to repair **48** citations by hand.
- **F-035** found `A0:153` citing `canon.md:280-285` for a sentence that range never
  contained — stale for an unknown length of time, carried as if it were canon.
- **F-035 then did it again**: a 12-line insert rotted **17** more citations in one commit.
  They were caught only because an adversarial reviewer diffed the old and new canon.

Three occurrences is not bad luck; it is the format. Every future edit to `canon.md` will do
this, and nothing in CI notices.

## What exists already

`scripts/tests/seal-provenance.test.mjs` (F-035) has a narrow version: it fails if any
`canon.md:N` citation in `docs/worldbuilding/*.md` lands on a blank line or past the end of
the file. It carries a named baseline of three known-stale citations:

- `canon.md:180-184`, `canon.md:233-244`, `canon.md:233-242` — all in `A0-current-world.md`,
  all already blank-anchored on `release/1.7`.

That check catches gross rot. It does **not** catch a citation that lands on a real line
holding the wrong content, which is the common case.

## Sketch

Options worth weighing, none decided:

- **Anchor citations to content, not lines.** Cite a heading or a quoted fragment
  (`canon.md §4 "the bell-seal certifies"`) and gate that the fragment still exists. Kills the
  problem at the root but touches every citation in the corpus.
- **A manifest.** One file mapping citation-id → expected line content; the gate asserts each
  still matches, and a `--fix` mode re-resolves line numbers by content after an edit. This is
  the mechanism F-035 used by hand and it worked.
- **Widen the existing blank-line gate** to every doc that cites any content file, not just
  `docs/worldbuilding/` into `canon.md` — `DR-*`, the specs, and the plans all do it too.

Whichever is chosen, it should also drain the three-item baseline above.

## Why now

Not blocking. But the cost is paid by whoever next edits `canon.md`, and it is paid in
silence — the corpus stays green while its citations decay.
