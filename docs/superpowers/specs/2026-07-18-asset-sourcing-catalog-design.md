# F-A — Asset Sourcing & Catalog (+ tiered license gate)

**Date:** 2026-07-18
**Branch:** `release/1.2` (edited in the `_release` worktree; `main` checkout edits are blocked by the ps-release-workflow guard)
**Status:** Design — awaiting user review
**Builds on:** F-002 asset pipeline, F-003 asset-forge, the universal-asset-previewer work (render-spec + storybook)

---

## 1. Context & why this exists

The repo's 3D coverage is strong (~112 catalog assets / 12 storybook sections, plus the F-003 Blender forge for bespoke mobs). The gap is **audio and VFX**: today there are **0 BGM/music tracks**, only **3 mapped SFX** (`sfx:attack`, `sfx:hit`, and `sfx:death` which is a known metal-latch *stand-in*), and "VFX" is only projectile/zone disc-glbs — no spell / explosion / firework / impact effects.

The user wants: RO-style BGM, more characters/mobs/env, VFX (magic spell, explosion, firework, metal+magic impact light), and impact SFX from soft to strong — fetched into the repo and cataloged.

This work was scoped in brainstorming into **three sequential features**:

| Feature | What | Status |
|---|---|---|
| **F-A** (this spec) | Asset sourcing & catalog + tiered license gate | designing now |
| **F-B** | Audio runtime — room BGM playback/crossfade + expanded impact SFX on combat edges | deferred, own cycle |
| **F-C** | VFX runtime — Godot effects fired on server combat events | deferred, own cycle |

F-A is the **foundation**: the runtime features cannot wire anything in-game until the assets exist in the repo.

## 2. Goal & scope boundary

**Goal:** a substantial, evenly-spread pull of CC0/CC-BY assets — BGM, impact SFX, VFX effect sets, and a 3D top-up — landed in the repo (Git LFS + `art-source/`), cataloged in the storybook, with a complete license ledger and a **green, and now stricter,** CI drift-gate.

**In scope**
- Download + intake of the four buckets (§4).
- Extend + harden `scripts/check_asset_manifest.mjs` to a tiered CC0/CC-BY license policy (§3).
- New `music-manifest.json`; extend `audio-manifest.json`; new `fx:*` keyspace under `catalog-manifest.json`; 3D top-up in existing keyspaces.
- New/expanded storybook sections: Music, expanded SFX, VFX; 3D folds in automatically.
- LICENSES.md rows for every new file.

**Explicitly OUT of scope (deferred)**
- Any runtime/gameplay wiring — no room-music playback, no combat-triggered VFX/SFX (F-B, F-C).
- A credits/attribution *screen* — F-A only **captures** the attribution data cleanly so a later feature can generate it.
- New server entity types / codegen keys. New 3D maps to existing curated keyspaces or existing codegen keys only.

## 3. License model — CC0 + CC-BY, tiered and enforced

**User decision:** CC0 preferred, CC-BY as a tagged fallback where CC0 can't deliver (mainly orchestral BGM), tiered ledger.

**Current reality (verified):** the gate checks that a `license` field is **non-empty**, but does **not** validate its value — so "CC0-only" has been a *documented convention*, not a machine check. That makes CC-BY support additive, and lets us harden the gate at the same time.

Changes:

1. **Allowed license set.** Gate accepts exactly `CC0` and `CC-BY-4.0`. Anything else (CC-BY-SA, CC-BY-NC, GPL, unknown) is a **hard failure** — catches license contamination that passes silently today.
2. **Attribution completeness for CC-BY.** A `CC-BY-*` entry MUST carry non-empty `source` **and** `author`. For `audio`/`music` (whose render-spec `require` list is only `["license"]` today) this becomes a *conditional* requirement: required **only when** `license` starts with `CC-BY`. CC0 entries are unaffected — no behavior change to existing rows.
3. **Baseline audit first.** Before turning the allowed-set check on, audit every existing LICENSES.md / manifest row so the stricter gate does not red-flag the current baseline. (All current rows are CC0, so this should be clean — but verify, don't assume.)
4. **Ledger tagging.** LICENSES.md keeps its `License`/`Author` columns; each new row's `License` cell carries the exact token (`CC0` / `CC-BY-4.0`) so a future credits screen can be generated mechanically.

## 4. Buckets, targets, sources

Targets reflect the user's **"bigger pull"** choice (~2× the initial proposal).

| Bucket | Target | Sources (CC0 first → CC-BY fallback) | Manifest / keyspace | Storybook |
|---|---|---|---|---|
| **BGM / music** | **~16–20 tracks** across moods: town, field, dungeon, battle, boss, ambient/peaceful | OpenGameArt CC0 fantasy loops; CC-BY orchestral where CC0 is thin | **new** `music-manifest.json`, keyspace `music:*` | new **Music** section (renderer already exists) |
| **Impact / combat SFX** | **~30–40** soft→strong: light hits, metal clang, heavy impacts, magic zap/whoosh, explosion booms | Kenney *Impact Sounds*, *RPG Audio*, *Interface Sounds* (all CC0); OpenGameArt CC0 fill | extend `audio-manifest.json`, `sfx:*` | expand existing **SFX** soundboard |
| **VFX** (spell / explosion / firework / metal+magic impact-light) | **~12–16 effect sets** | Kenney *Particle Pack* (CC0); OpenGameArt CC0/CC-BY animated effect sheets; a few 3D where it fits | **new** `fx:*` keyspace in `catalog-manifest.json` | new **VFX** section |
| **3D top-up** | **~20–30** chars/mobs/env | Poly Pizza — Quaternius / Kenney (CC0), proven `curl --compressed` path | existing `creature:` / `env:` / `weapon:` / `loot:` in `catalog-manifest.json` | folds into existing sections automatically |

**Replaces the `sfx:death` stand-in** with a real impact/death sample from Kenney Impact Sounds.

## 5. VFX format — both, decided per effect

**User decision:** 2D animated sprite sheets **where they exist**, 3D **where it makes sense**, per effect.

- **2D sprite-sheet VFX** → existing `spritesheet` renderer (F-002 Phase 2 infra: Canvas2D SpriteFrames, clip `<select>`, rAF stepper). This is where most CC0/CC-BY explosion/spell/firework content lives.
- **3D VFX** → `model3d` renderer (e.g. an emissive impact-flash glb, a firework burst mesh) when a good CC0 3D effect exists or a simple one is worth authoring.
- Both live under the **`fx:*`** keyspace in `catalog-manifest.json` (curated, `driftGated:false`), which is **exempt** from the gate's guard-A "must be sceneLoadable / no 2D-image-for-codegen-keys" rule — so 2D sprite sheets are legal here. `fx:*` is deliberately distinct from the codegen `projectile:*` / `zone:*` keys (the `vfx` *kind*), so there is no keyspace collision (guard G stays satisfied).

Each `fx:*` entry records `render` (`spritesheet` | `model3d`) so the storybook and gate pick the right builder. The **per-effect 2D-vs-3D call is made at intake** and recorded in the manifest + ledger; the plan does not pre-commit each effect to a format.

## 6. Sourcing mechanics — honest about automation vs. manual

| Path | Sources | Who does it |
|---|---|---|
| **Fully automatable** | Poly Pizza 3D (`curl --compressed static.poly.pizza/<uuid>.glb.br`), Kenney direct-download zips, OpenGameArt direct file links | I fetch it |
| **Browser-assisted** | JS-gated download flows | I try `claude-in-chrome` first |
| **Gated (manual)** | Freesound login/API, any flow that defeats automation | I hand the user a tight checklist ("download these N files → this folder"), then resume intake |

Every asset is tagged in the intake notes with the path it took, so there's never ambiguity about what's actually in the repo vs. still pending a manual fetch. Because most audio needs unzipping/curating from packs, expect a manual-checklist step for at least some SFX/BGM.

## 7. Manifest & keyspace changes (concrete)

- **`game-client/assets/music-manifest.json`** — new file, `{version, entries}` shape mirroring `audio-manifest.json`. Entries `music:<mood>_<name>` → `{stream, license, source, author}`.
- **Register it in the gate.** `scripts/check_asset_manifest.mjs` → `manifestSources()` gets one more entry (`music-manifest`, `keyspace:"curated"`, `driftGated:false`) — the code literally comments this extension point (`+1 line per new curated file`).
- **`audio-manifest.json`** — append `sfx:*` impact/combat entries; upgrade the `sfx:death` row from stand-in to a real sample.
- **`catalog-manifest.json`** — append `fx:*` (spritesheet + model3d) and the 3D top-up under existing `creature:`/`env:`/`weapon:`/`loot:` keyspaces (currently 42 entries; 9 keyspaces).
- **`render-spec.json`** — no new renderers needed (`music`, `audio`, `spritesheet`, `model3d`, `image` all exist). The only render-spec touch is if we make `source`/`author` conditionally-required for CC-BY audio/music — implemented in the gate, not necessarily the spec's static `require` list (a `require` entry can't express "only when CC-BY").

## 8. Intake flow (reuses existing rails)

```
download → art-source/seed/<pack>/  (Git LFS)
        → copy / transcode into game-client/assets/{audio,music,vfx,characters,creatures,env,...}
        → add manifest entries (music / audio / catalog as appropriate)
        → add LICENSES.md row(s)  (License token exact; author+source for CC-BY)
        → run drift-gate  → storybook verify
```

- **3D** can reuse F-003's transactional `tools/asset-forge/intake.mjs` (validate → copy → manifest-last → gate, with rollback).
- **Audio / VFX** go through the manifest + gate path (no glb validation needed for `.ogg`/`.png`).
- **LFS:** `.glb`, `.ogg`, `.png`, and any `.mp3`/`.wav` already covered by `.gitattributes`; add patterns if a new extension appears.

## 9. Storybook changes

- New **Music** section: track list + WebAudio player (the `decodeAudioData` path already used for SFX, because the static server lacks HTTP Range).
- Expanded **SFX** soundboard: the new impact/combat clips, mapped ones badged.
- New **VFX** section: sprite-sheet effects use the Phase-2 animated stepper; 3D effects use the model-viewer card.
- **3D top-up** appears automatically in the existing Creatures / Environment / Weapons / Loot sections (data-driven from `catalog-manifest.json`).

## 10. Verification (evidence, per the global rules)

Work is **not done** until:

1. `node scripts/check_asset_manifest.mjs` (and `--require-complete` where applicable) exits **0**, including the new license-policy checks — with output pasted.
2. Storybook loads in a **foregrounded** Chrome tab (the headless tab-pause caveat is documented — background tabs pause model-viewer + rAF), showing every new section; audio plays via WebAudio; no console errors.
3. Every new file has a LICENSES.md row; every CC-BY row has non-empty author + source (assert via the gate).
4. Per the phased quality gate: the **gate code change** gets an independent adversarial review (fresh subagent / `ecc:code-reviewer`) on its own diff before it's considered done, then re-verify.

## 11. Risks & blast radius — LOW–MEDIUM

- **Gate hardening could red-flag the existing baseline** → mitigated by the §3.3 baseline audit *before* enabling the allowed-set check.
- **No server / runtime / gameplay code touched** — this is content + one CI script. Reversible via LFS-tracked, revertable commits.
- **LFS growth** is the real cost: ~16–20 BGM at 1–4 MB ≈ 30–80 MB, plus SFX/VFX. Acceptable, bounded, reversible.
- **CC-BY attribution debt:** every CC-BY asset creates a standing obligation to credit it. Mitigated by capturing author/source at intake and gate-enforcing it; the actual credits screen is a tracked follow-up.
- **Sourcing friction:** some audio is behind gated flows → handled by the §6 manual-checklist fallback; expect at least one human-download round.

## 12. Process routing

**User decision:** commit **direct to `release/1.2`** via the `_release` worktree (like prior content-only seeding), **not** a formal F-NNN feature claim. Honored — with two disciplines kept:
- The **gate code change** lands as its **own reviewable commit**, separate from bulk content commits.
- The **§3.3 baseline audit** runs before the gate change is enabled.

## 13. Follow-ups (out of F-A, tracked)

- **F-B** — Audio runtime: room BGM playback + crossfade; expanded impact SFX on combat edges.
- **F-C** — VFX runtime: Godot effects fired on server combat events (reuses the EventBus → state-edge pattern).
- **Credits screen** — auto-generated from the CC-BY ledger rows.
