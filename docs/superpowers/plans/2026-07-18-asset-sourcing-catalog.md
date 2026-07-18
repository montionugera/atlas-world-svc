# Asset Sourcing & Catalog (F-A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a large CC0/CC-BY pull of BGM, impact SFX, 2D/3D VFX, and a 3D top-up into the repo, cataloged in the storybook, behind a hardened tiered-license CI gate.

**Architecture:** Content-intake feature. One real code change (harden `scripts/check_asset_manifest.mjs` to a CC0/CC-BY-4.0 policy via a new pure `scripts/lib/license-policy.mjs`), then four content buckets that add manifest entries + LICENSES rows + LFS binaries and verify through the existing drift-gate and the data-driven storybook. Only BGM needs new storybook code (a music-manifest source the storybook doesn't fetch yet); SFX/VFX/3D auto-appear.

**Tech Stack:** Node ESM (`.mjs`) gate + `node --test`; Godot glTF/`.ogg`/PNG assets under Git LFS; `<model-viewer>` + WebAudio + Canvas2D storybook; Poly Pizza / Kenney / OpenGameArt sourcing.

## Global Constraints

- **License policy:** every asset is `CC0` or `CC-BY-4.0` — no other value. A `CC-BY-*` asset MUST carry non-empty `source` AND `author` in its manifest entry. Copy the token verbatim into the LICENSES.md `License` cell.
- **Worktree:** all edits happen in the `_release` worktree (`.claude/worktrees/_release/`); the `main` checkout is guard-blocked. All commits land on `release/1.2`.
- **LFS:** binaries (`.glb .gltf .ogg .wav .mp3 .png` under the covered globs) are already LFS-tracked via `.gitattributes`. Verify with `git check-attr filter <file>` → `filter: lfs` before committing any new binary.
- **Gate command (the test cycle for content):** from the worktree root, `node scripts/check_asset_manifest.mjs` must exit `0`. Some content-completeness checks also run `node scripts/check_asset_manifest.mjs --require-complete`.
- **Storybook verify:** serve `python3 -m http.server 8099` from the worktree root, open `http://localhost:8099/tools/asset-storybook/index.html` in a **foregrounded** Chrome tab (background tabs pause model-viewer + rAF), confirm the new section renders and audio plays, zero console errors.
- **LICENSES row format** (append to `art-source/LICENSES.md`): `| <baked path> | <market/hand/internal> | <Pack / URL> | <CC0\|CC-BY-4.0> | <Author> | 2026-07-18 | seed tier — <key> |`
- **Commit style:** conventional subject, one commit per task, direct to `release/1.2`. End messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Sourcing reality:** asset *selection + URLs* are discovered at execution. Automatable sources (Poly Pizza `curl --compressed static.poly.pizza/<uuid>.glb.br`, Kenney direct zips, OpenGameArt direct links) are fetched by the driving session; gated sources (Freesound login, JS-only flows) produce a short manual-download checklist handed to the user, who drops files into the named folder before intake resumes. Tag each asset with the path it took.
- **Per-phase quality gate:** each task ends verified (gate + storybook), and Task 2's code diff gets an independent adversarial review before it's "done".

---

## Task 1: Baseline license audit

Ensures the stricter gate (Task 2) will not red-flag existing rows. Pure investigation + at most small fixes.

**Files:**
- Read: `game-client/assets/manifest.json`, `game-client/assets/catalog-manifest.json`, `game-client/assets/audio-manifest.json`, `art-source/LICENSES.md`
- Modify (only if a violation is found): whichever manifest/ledger row is non-conforming

**Interfaces:**
- Produces: a confirmed-clean baseline (every existing `license` value ∈ {`CC0`, `CC-BY-4.0`}), so Task 2 can enable the allowed-set check without breaking the gate.

- [ ] **Step 1: Scan every manifest for license values**

Run from the worktree root:
```bash
for f in game-client/assets/manifest.json game-client/assets/catalog-manifest.json game-client/assets/audio-manifest.json; do
  echo "== $f =="
  python3 -c "import json,sys;d=json.load(open('$f'));print(sorted({ (e.get('license') or '∅') for e in d.get('entries',{}).values() }))"
done
```
Expected: only `CC0` values (and possibly the `sfx:death` long-form note string — flag it).

- [ ] **Step 2: Normalize any non-token license values**

If any value is a long-form string (e.g. the `sfx:death` note `"CC0 (Kenney RPG Audio) -- ..."`), split it: set `license` to the bare token `CC0`, move the prose into a sibling `source`/`note` field. This is required — Task 2's allowed-set check compares the exact `license` value.

Example fix in `game-client/assets/audio-manifest.json`:
```json
"sfx:death": {
  "stream": "res://assets/audio/metalLatch.ogg",
  "license": "CC0",
  "source": "Kenney RPG Audio (stand-in — replaced in Task 3)"
}
```

- [ ] **Step 3: Confirm the gate is still green after normalization**

Run: `node scripts/check_asset_manifest.mjs`
Expected: exit `0` (unchanged behavior — Task 1 only normalizes strings).

- [ ] **Step 4: Commit**

```bash
git add game-client/assets/*.json
git commit -m "chore(assets): normalize license fields to bare tokens for gate policy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Tiered license-policy gate (TDD)

Harden the gate from "license present" to "license ∈ {CC0, CC-BY-4.0} + CC-BY needs author+source". Implemented as a pure, unit-tested module so it needs no filesystem fixtures.

**Files:**
- Create: `scripts/lib/license-policy.mjs`
- Create: `scripts/tests/license-policy.test.mjs`
- Modify: `scripts/check_asset_manifest.mjs` (import + call inside `validateEntry`, after guard (C) at ~line 243)

**Interfaces:**
- Produces: `checkLicensePolicy(id, entry, failures)` — pushes human-readable strings onto `failures` for policy violations; returns nothing. `validateEntry` calls it once per entry.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/license-policy.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLicensePolicy } from "../lib/license-policy.mjs";

const run = (entry) => {
  const failures = [];
  checkLicensePolicy("x", entry, failures);
  return failures;
};

test("CC0 entry passes with no source/author", () => {
  assert.deepEqual(run({ license: "CC0" }), []);
});

test("unknown license fails", () => {
  const f = run({ license: "CC-BY-SA-4.0", source: "s", author: "a" });
  assert.equal(f.length, 1);
  assert.match(f[0], /not allowed/);
});

test("CC-BY missing author fails", () => {
  const f = run({ license: "CC-BY-4.0", source: "OpenGameArt" });
  assert.equal(f.length, 1);
  assert.match(f[0], /CC-BY requires non-empty "author"/);
});

test("CC-BY missing source fails", () => {
  const f = run({ license: "CC-BY-4.0", author: "Composer" });
  assert.equal(f.length, 1);
  assert.match(f[0], /CC-BY requires non-empty "source"/);
});

test("CC-BY with author+source passes", () => {
  assert.deepEqual(
    run({ license: "CC-BY-4.0", source: "OpenGameArt", author: "Composer" }),
    [],
  );
});

test("empty license is left to the require-check (no policy error)", () => {
  assert.deepEqual(run({}), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/license-policy.test.mjs`
Expected: FAIL — `Cannot find module '../lib/license-policy.mjs'`.

- [ ] **Step 3: Implement the module**

Create `scripts/lib/license-policy.mjs`:
```js
// Tiered license policy for the asset drift-gate (F-A).
// CC0 and CC-BY-4.0 are the only accepted licenses; CC-BY additionally
// requires attribution (non-empty source + author) so a credits screen
// can be generated mechanically later. Empty license is NOT this module's
// concern — the render-spec `require` list already fails an empty license.
const ALLOWED = new Set(["CC0", "CC-BY-4.0"]);

function isEmpty(v) {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

export function checkLicensePolicy(id, entry, failures) {
  const lic = typeof entry.license === "string" ? entry.license.trim() : "";
  if (lic === "") return; // presence is enforced elsewhere
  if (!ALLOWED.has(lic)) {
    failures.push(
      `entry "${id}": license "${lic}" not allowed — must be one of ${[...ALLOWED].join(", ")}`,
    );
    return;
  }
  if (lic.startsWith("CC-BY")) {
    for (const f of ["source", "author"]) {
      if (isEmpty(entry[f])) {
        failures.push(`entry "${id}": CC-BY requires non-empty "${f}"`);
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/tests/license-policy.test.mjs`
Expected: PASS (6/6).

- [ ] **Step 5: Wire it into the gate**

In `scripts/check_asset_manifest.mjs`, add the import near the other imports at the top:
```js
import { checkLicensePolicy } from "./lib/license-policy.mjs";
```
Then inside `validateEntry`, immediately after the guard (C) `for (const f of r.require)` loop (before guard (D)), add:
```js
  // (I) tiered license policy — allowed set + CC-BY attribution completeness.
  checkLicensePolicy(id, entry, failures);
```

- [ ] **Step 6: Verify the full gate is still green on the current baseline**

Run: `node scripts/check_asset_manifest.mjs`
Expected: exit `0` (Task 1 guaranteed all baseline rows are CC0).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/license-policy.mjs scripts/tests/license-policy.test.mjs scripts/check_asset_manifest.mjs
git commit -m "feat(assets): tiered CC0/CC-BY license policy in the drift-gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Adversarial review of this diff**

Dispatch a fresh reviewer (`ecc:code-reviewer` or a general subagent) against the Task 2 diff only. Focus: does the CC-BY prefix match (`startsWith("CC-BY")`) admit anything unintended given the allowed-set gate already ran? Any way an unknown license slips through? Fix findings, re-run Steps 4 & 6, then advance.

---

## Task 3: Impact & combat SFX bucket (~30–40)

Source soft→strong impact/combat SFX; replace the `sfx:death` stand-in. Auto-appears in the storybook SFX soundboard (data-driven).

**Files:**
- Create: `art-source/seed/audio/<pack>/…` (raw, LFS), `game-client/assets/audio/*.ogg` (baked, LFS)
- Modify: `game-client/assets/audio-manifest.json`, `art-source/LICENSES.md`

**Interfaces:**
- Consumes: Task 2 gate (entries validated against license policy).
- Produces: new `sfx:*` entries; a real `sfx:death` sample.

- [ ] **Step 1: Source + place the clips**

Fetch from Kenney *Impact Sounds* / *RPG Audio* / *Interface Sounds* (CC0) and OpenGameArt CC0 fill. Automatable → fetch directly; gated → emit a manual checklist to `art-source/seed/audio/<pack>/`. Copy the chosen `.ogg` into `game-client/assets/audio/`. Verify LFS: `git check-attr filter game-client/assets/audio/<file>.ogg` → `filter: lfs`.

- [ ] **Step 2: Add manifest entries**

Append to `game-client/assets/audio-manifest.json` `entries` (repeat per clip; CC0 needs no author):
```json
"sfx:impact_metal_heavy": {
  "stream": "res://assets/audio/impact_metal_heavy.ogg",
  "license": "CC0",
  "source": "Kenney Impact Sounds"
},
"sfx:death": {
  "stream": "res://assets/audio/death_thud.ogg",
  "license": "CC0",
  "source": "Kenney Impact Sounds (real death sample, replaces the metalLatch stand-in)"
}
```
For any CC-BY clip, add `"author": "<composer>"` (gate-enforced).

- [ ] **Step 3: Add LICENSES rows** — one per new file, using the Global-Constraints row format.

- [ ] **Step 4: Run the gate**

Run: `node scripts/check_asset_manifest.mjs`
Expected: exit `0`.

- [ ] **Step 5: Storybook verify** — foregrounded Chrome (Global-Constraints steps); confirm the new clips appear in the SFX soundboard and play; zero console errors.

- [ ] **Step 6: Commit**

```bash
git add game-client/assets/audio/ game-client/assets/audio-manifest.json art-source/
git commit -m "feat(assets): impact & combat SFX pack + real death sample (CC0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: BGM / music bucket (~16–20) + storybook Music section

New `music-manifest.json` (the storybook doesn't fetch one yet, so this is the only bucket needing storybook code), registered in the gate.

**Files:**
- Create: `game-client/assets/music-manifest.json`, `game-client/assets/music/*.ogg` (LFS), `art-source/seed/audio/music/…` (LFS)
- Modify: `scripts/check_asset_manifest.mjs` (`manifestSources` + a `--music-manifest` opt + default path), `tools/asset-storybook/index.html` (fetch + Music section), `art-source/LICENSES.md`

**Interfaces:**
- Consumes: Task 2 gate.
- Produces: `music:*` entries `{ stream, license, source, author? }`; a new gate source `music-manifest`; a storybook Music section.

- [ ] **Step 1: Create an empty music-manifest**

Create `game-client/assets/music-manifest.json`:
```json
{ "version": 1, "entries": {} }
```

- [ ] **Step 2: Register it in the gate**

In `scripts/check_asset_manifest.mjs`: add a default path + arg (mirror `catalogManifest`/`--catalog-manifest` at ~lines 78–92):
```js
musicManifest: join(here, "..", "game-client/assets/music-manifest.json"),
```
```js
else if (a === "--music-manifest") opts.musicManifest = resolve(argv[++i]);
```
Then add to `manifestSources()` (the documented `+1 line` slot):
```js
{ path: opts.musicManifest, label: "music-manifest", keyspace: "curated", driftGated: false },
```

- [ ] **Step 3: Verify the gate accepts the empty manifest**

Run: `node scripts/check_asset_manifest.mjs`
Expected: exit `0` (empty `entries` is valid).

- [ ] **Step 4: Source + place ~16–20 tracks**

Moods: town, field, dungeon, battle, boss, ambient. CC0 first (OpenGameArt), CC-BY-4.0 orchestral fallback. Place raw under `art-source/seed/audio/music/`, baked `.ogg` under `game-client/assets/music/`. Verify LFS on each.

- [ ] **Step 5: Fill music-manifest entries** (repeat per track; CC-BY needs author+source):
```json
"music:town_market": {
  "stream": "res://assets/music/town_market.ogg",
  "license": "CC-BY-4.0",
  "source": "OpenGameArt — <url>",
  "author": "<composer>"
}
```

- [ ] **Step 6: Add the storybook Music section**

In `tools/asset-storybook/index.html`, next to `AUDIO_MANIFEST_URL` (~line 720) add:
```js
const MUSIC_MANIFEST_URL = "../../game-client/assets/music-manifest.json";
```
Fetch it alongside the other manifests in the loader, and render a **Music** section reusing the existing WebAudio (`decodeAudioData`) player used by the SFX soundboard (a track list with play buttons + the license/author badge). Add a "Music" nav entry with a count.

- [ ] **Step 7: Add LICENSES rows** — one per track; CC-BY rows require Author.

- [ ] **Step 8: Run the gate**

Run: `node scripts/check_asset_manifest.mjs`
Expected: exit `0` (CC-BY tracks fail here if author/source is missing — fix and rerun).

- [ ] **Step 9: Storybook verify** — foregrounded Chrome; the Music section lists all tracks and plays them; zero console errors.

- [ ] **Step 10: Commit**

```bash
git add game-client/assets/music/ game-client/assets/music-manifest.json scripts/check_asset_manifest.mjs tools/asset-storybook/index.html art-source/
git commit -m "feat(assets): BGM library + music-manifest + storybook Music section

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: VFX bucket (~12–16 sets) — 2D sprite sheets + 3D per effect

`fx:*` keyspace in `catalog-manifest.json`. 2D → `spritesheet` renderer, 3D → `model3d`. Both auto-render (renderers exist); grouped into a VFX section by `kind`.

**Files:**
- Create: `art-source/seed/vfx/…` (LFS), `game-client/assets/vfx/*.png` (2D sheets, LFS) and/or `game-client/assets/vfx/*.glb` (3D, LFS)
- Modify: `game-client/assets/catalog-manifest.json`, `tools/asset-storybook/index.html` (only if a distinct "VFX" nav label is wanted), `art-source/LICENSES.md`

**Interfaces:**
- Consumes: Task 2 gate; existing `spritesheet`/`model3d` renderers + Phase-2 sprite stepper.
- Produces: `fx:*` entries. Each records `render` + (for spritesheet) `frame`/`animations` per the render-spec `spritesheet` require list.

- [ ] **Step 1: Source + place effects** — magic spell, explosion, firework, metal+magic impact-light. Kenney *Particle Pack* (CC0) + OpenGameArt CC0/CC-BY effect sheets; author a simple emissive impact glb where a 3D flash reads better. Decide 2D-vs-3D per effect and record it. Verify LFS on each file.

- [ ] **Step 2: Add manifest entries** (repeat per effect). 2D sprite sheet (fields per the `spritesheet` require list — `license`, `source`, plus the frame/animation shape the Phase-2 renderer already uses for `sprite:slime`):
```json
"fx:explosion": {
  "kind": "vfx",
  "render": "spritesheet",
  "stream": "res://assets/vfx/explosion.png",
  "frame": { "w": 64, "h": 64, "cols": 8, "rows": 1 },
  "animations": { "burst": [0, 1, 2, 3, 4, 5, 6, 7] },
  "license": "CC0",
  "source": "Kenney Particle Pack"
}
```
3D effect:
```json
"fx:impact_flash": {
  "kind": "vfx",
  "render": "model3d",
  "scene": "res://assets/vfx/impact_flash.glb",
  "license": "CC0",
  "source": "authored (emissive burst)"
}
```
> Match `frame`/`animations` field names to the existing `sprite:slime` entry in `catalog-manifest.json` — read it first and mirror its exact shape so the Phase-2 renderer and gate accept it.

- [ ] **Step 3: Confirm/adjust the storybook grouping** — `fx:*` entries carry `kind:"vfx"`; check whether they land in the existing VFX grouping. If a distinct **VFX** nav label/section is desired, add it in `tools/asset-storybook/index.html` the same data-driven way other kinds are grouped.

- [ ] **Step 4: Add LICENSES rows.**

- [ ] **Step 5: Run the gate**

Run: `node scripts/check_asset_manifest.mjs`
Expected: exit `0`. (Guard A does not apply — `fx:*` is curated, `driftGated:false`.)

- [ ] **Step 6: Storybook verify** — foregrounded Chrome; sprite-sheet effects animate via the stepper, 3D effects render in model-viewer; zero console errors.

- [ ] **Step 7: Commit**

```bash
git add game-client/assets/vfx/ game-client/assets/catalog-manifest.json tools/asset-storybook/index.html art-source/
git commit -m "feat(assets): VFX effect sets (2D sprite sheets + 3D), fx:* keyspace

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 3D content top-up (~20–30)

More characters/mobs/env into existing curated keyspaces. Auto-appears in existing storybook sections.

**Files:**
- Create: `game-client/assets/{creatures,env,characters,...}/*.glb` (LFS), raw under `art-source/seed/…`
- Modify: `game-client/assets/catalog-manifest.json`, `art-source/LICENSES.md`

**Interfaces:**
- Consumes: Task 2 gate; existing `creature:`/`env:`/`weapon:`/`loot:` keyspaces (42 entries today).
- Produces: new `creature:*`/`env:*`/… entries.

- [ ] **Step 1: Source + place models** — Poly Pizza (Quaternius/Kenney CC0): `curl -s --compressed -o game-client/assets/creatures/<name>.glb "https://static.poly.pizza/<uuid>.glb.br"`. Optionally run through `tools/asset-forge/intake.mjs` for validation. Verify LFS on each glb.

- [ ] **Step 2: Add manifest entries** (repeat per model; mirror an existing `creature:*` row):
```json
"creature:wolf": {
  "kind": "creature",
  "scene": "res://assets/creatures/wolf.glb",
  "license": "CC0",
  "source": "Quaternius — via poly.pizza/m/<id>"
}
```

- [ ] **Step 3: Add LICENSES rows.**

- [ ] **Step 4: Run the gate**

Run: `node scripts/check_asset_manifest.mjs`
Expected: exit `0`.

- [ ] **Step 5: Storybook verify** — foregrounded Chrome; new models appear in Creatures/Environment/etc. and turntable-render; zero console errors.

- [ ] **Step 6: Commit**

```bash
git add game-client/assets/ game-client/assets/catalog-manifest.json art-source/
git commit -m "feat(assets): 3D content top-up — creatures/env/characters (CC0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Final integration verify + ledger completeness

One pass that proves the whole set is coherent and the ledger is complete.

**Files:**
- Read/verify only; fix-forward any gap found.

- [ ] **Step 1: Full gate, including completeness**

Run: `node scripts/check_asset_manifest.mjs && node scripts/check_asset_manifest.mjs --require-complete`
Expected: first exits `0`; the `--require-complete` run's only failures (if any) are the pre-existing unmapped `projectile:*`/`zone:*` codegen keys — no new gaps introduced by F-A.

- [ ] **Step 2: Run the license-policy unit tests**

Run: `node --test scripts/tests/license-policy.test.mjs`
Expected: PASS.

- [ ] **Step 3: Ledger completeness check**

Confirm every file added under `game-client/assets/` in this feature has a LICENSES.md row, and every `CC-BY-4.0` row has a non-empty Author:
```bash
grep -c 'CC-BY-4.0' art-source/LICENSES.md   # sanity: count matches CC-BY assets added
```

- [ ] **Step 4: Full storybook sweep** — foregrounded Chrome; walk every section (Music, SFX, VFX, Creatures, Environment, Characters, Weapons, Loot); each renders/plays; zero console errors. Capture a note of counts per section.

- [ ] **Step 5: Final commit (if any fix-forward was needed)**

```bash
git add -A
git commit -m "chore(assets): F-A final integration verification pass

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** §3 license model → Tasks 1–2. §4 buckets/targets → Tasks 3–6 (SFX/BGM/VFX/3D, bigger-pull counts carried). §5 VFX both formats → Task 5. §6 sourcing mechanics → Global Constraints + each bucket Step 1. §7 manifest/keyspace changes → Tasks 3–6 (music-manifest new + registered in Task 4; audio/catalog extended; `fx:*`). §9 storybook → Music in Task 4, others auto + Task 5 Step 3. §10 verification → every task's gate+storybook steps + Task 7. §12 direct-to-release routing → Global Constraints. Deferred F-B/F-C/credits-screen correctly absent.

**Placeholder scan:** manifest/test/gate code shown in full; the only intentionally execution-time-discovered items are asset URLs/selection (§6 sourcing reality — genuinely not knowable ahead), with exact schemas and commands around them.

**Type consistency:** `checkLicensePolicy(id, entry, failures)` defined in Task 2 and called identically in the gate wiring. Manifest field names (`stream`/`scene`/`license`/`source`/`author`/`kind`/`render`/`frame`/`animations`) consistent across tasks and matched to existing entries (`sprite:slime`, `creature:*`) by instruction to mirror them.
