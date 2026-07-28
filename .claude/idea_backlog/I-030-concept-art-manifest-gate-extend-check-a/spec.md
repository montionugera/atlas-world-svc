---
title: "Concept-art manifest gate: extend check_asset_manifest.mjs to cover game-client/assets/art/art-manifest.json (80 ungated keys, LFS files unverified) + close the missing art:race-human key"
id: I-030
status: idea
---

# Concept-art manifest gate — 80 keys nobody checks

## Problem

`game-client/assets/art/art-manifest.json` holds **80 entries** (9 cast + 7 race +
64 class concept-art images, all PNGs in Git LFS) and **no gate validates it.**

Verified: `scripts/check_asset_manifest.mjs` reads exactly four inputs —
`colyseus-server/generated/asset-keys.json`, `game-client/assets/render-spec.json`,
`manifest.json`, `audio-manifest.json`, `catalog-manifest.json`. `art-manifest.json`
is not among them. Repo-wide, the only non-doc consumer is
`tools/asset-storybook/index.html`, which fetches it at runtime.

Consequences:
- A manifest entry whose `file` no longer exists on disk fails **silently in the
  browser** — a broken image in the storybook, green CI.
- A committed PNG with no manifest entry is invisible forever.
- **LFS pointer-vs-payload is unverified.** A fresh clone without `git lfs pull` gets
  pointer stubs; nothing detects that.

**The concrete symptom already present:** the race lineup is **7, not 8**.
`grep -o '"art:race-[a-z]*"'` returns beastkin, demon, dragon, dwarf, elf, immortal,
ogre — **`art:race-human` is missing**, even though `human` heads the class grid and
all 8 human class images exist. `HANDOFF-2026-07-28.md:20` claims "Races 8 —
Human(=cast)", i.e. human deliberately reuses a cast image. That may be a fine
decision, but with no gate it is indistinguishable from an omission — which is exactly
how it went unnoticed.

## Why now

- Cheap and well-bounded: an existing gate script gains one more source. The
  `driftGated: false` (curated) mode already used for `audio-manifest.json` and
  `catalog-manifest.json` is the right precedent — art keys are curated, not codegen-keyed.
- Gate 2 (`scripts/integration.sh`) now exists and runs 8 sections; this slots into the
  content-gate section with no new infrastructure.
- The concept-art set is finished and stable, so the gate is being written against a
  known-good baseline rather than a moving target.

## Sketch

(rough shape; not a design yet)

1. Add `art-manifest.json` as a curated (`driftGated: false`) source in
   `check_asset_manifest.mjs`, reusing the existing curated-manifest code path.
2. Assert: every entry's `file` resolves on disk; every image under
   `game-client/assets/art/` has an entry; keyspaces stay disjoint from the other
   manifests (rule G already exists).
3. Add an LFS-payload check — a file whose contents start with
   `version https://git-lfs.github.com/spec/v1` is a pointer, not an image.
4. Decide `art:race-human` explicitly: either mint the key pointing at the chosen cast
   image, or record in the manifest why the race group is 7. Do not leave it implicit.
5. Optionally assert group completeness: `class` group should be exactly 8×8 = 64.

## Open questions

- Should the gate hard-fail or warn on an unreferenced image? Existing precedent
  (`UNMAPPED`/`UNKNOWN`) is **warn** — likely match that to start.
- Does the storybook need `render-spec.json` awareness for art entries, or are they
  always plain images? (Currently they appear to be plain PNGs with no `render` field.)

## Related

- Handoff: `docs/superpowers/decisions/2026-07-27-world-wisdom-handoff.md` §9
  ("Not captured as ideas, flagged only")
- `HANDOFF-2026-07-28.md` §1 — the concept-art sprint that produced these 80 entries
- Existing gate: `scripts/check_asset_manifest.mjs`
- [[I-031]] — the pipeline that generates this art
