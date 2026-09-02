<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->

## Token budget — images and session cap

Audit 2026-09-01 (this repo's 15 largest sessions): peak context median
~425K tokens, max ~774K. The cause was NOT repo size or text files — **~86% of
all tool-result bytes were full-size image reads** (world-map PNGs under
`game-client/assets/art/maps/`, `art-source/`, plus Chrome screenshots).

- **Never Read a full-size PNG/screenshot in the main thread.** One world-map
  PNG ≈ 170K tokens — a single image can exceed the whole session budget.
  Instead: downscale then read the copy
  (`sips -Z 1024 <file>.png --out /tmp/<name>.png`), or dispatch a subagent to
  judge the art and return a text verdict. Screenshot-iteration: batch it in a
  subagent, not inline.
- **Cap sessions at ~50 steps or ~100K context.** Every step re-processes the
  whole context (a 1,161-step session here burned ~404M tokens). At a verified
  milestone, hand off to a fresh session instead of riding to compaction.
