# Combat Balance Lab

Interactive view of the I-028 combat stat model. Drag any input; the rank
ladder, outcome matrix, player curve and invariants all recompute live.

```bash
node scripts/gen_combat_model.mjs          # refresh combat-model.json
node tools/combat-lab/verify.mjs           # assert the page matches the spec
cd tools/combat-lab && python3 -m http.server 8421
# → http://localhost:8421/
```

`fetch()` is blocked over `file://`, so it has to be served — same as
`tools/asset-storybook`.

## Why it is built this way

Single static HTML, no build step, no dependencies — matching
`tools/asset-storybook` and `tools/story-explorer`. The data pipeline follows
`scripts/gen_audio_index.mjs`: a generator reads the real thing on disk and
writes JSON; the page only renders.

`combat-model.json` contains the model and nothing else. It does **not** read
the game's source.

An earlier version scraped the shipped combat constants out of the server's
TypeScript so the page could show live drift. That was wrong at this stage: the
running code is a single-player debug prototype, and putting it beside the design
invites the design to be judged against it — or bent to match it. The foundation
gets settled on its own terms; reconciling it with what ships is a separate,
later job.

## Verifying it

`CHECKLIST.md` is the human-facing procedure — ten hand-checks with expected
values, plus an explicit list of what is **not** verified. Read that before
trusting any verdict on the page. `verify.mjs` below only covers the arithmetic.

## verify.mjs

The page and `model/balance_sheet.py` are two implementations of one model.
`verify.mjs` lifts the pure-model region out of `index.html` and checks it
reproduces every number in
`docs/superpowers/specs/2026-07-28-combat-balance-sheet.md` — 4 requirements,
8 ladder rows, 42 player-curve cells, 8 invariants. Run it after touching either
side. It exits non-zero on any mismatch, so it can go straight into CI.

## Reading the numbers

`R` = how long you survive ÷ how long the encounter survives. `R > 1` is a win
and `1 − 1/R` is the HP you finish with. For a single duel it collapses to
`(CS_player / CS_mob)²` — CombatScore is the sufficient statistic and the
DPS/EHP split cancels.

Encounters use the "n mobs **and** n players" reading, where Lanchester's `+n²`
(focus fire) and `−n(n+1)/2` (pack dies one at a time) nearly cancel:

```
R_encounter = R_single × 2n/(n+1)
```

Bands: LOSS `<1.0` · brutal `<1.3` · hard `<2.0` · fair `<3.5` · easy `<8` ·
trivial `≥8`.

## Known gaps

Listed in-page under "Not covered here", and unchanged from the balance sheet:
closed-form only (no crit variance, misses, or kiting); top-rank encounter TTK
derives to 2–9s against a 3000–4500s target; mana, skills and physical-vs-magic
parity are still modelled separately in `model/mana_level.py` and
`model/parity.py` and are not folded into `R`.
