# T0 Art Forge Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make concept art reproducible and gated — commit the lost generation pipeline, validate the 80 ungated manifest entries, and let the storybook display the group keyspace that tracks T1–T3 will fill.

**Architecture:** `art-manifest.json` stays its own curated sink (concept art has no renderer, so it cannot travel the render-spec path — proven in the spec §4). `scripts/check_asset_manifest.mjs` gains a per-source `validator` field so art entries get a dedicated `validateArtEntry()` while the four existing sources keep `validateEntry()` untouched. A new `game-client/assets/art/art-groups.json` is the single group registry read by both the gate and the storybook. `tools/art-forge/` holds the recipe, with GPU-bound generation strictly separated from CI-runnable intake.

**Tech Stack:** Node 18 ESM (`node --test`), the existing `scripts/` package (`@atlas/content-gate`), vanilla-JS single-file storybook, ComfyUI + Z-Image Turbo on mont-pc (generation only).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-01-art-forge-foundation-design.md` — read it before Task 1.
- **This task ships ZERO new artwork.** Any step that generates a new image is out of scope.
- **Nothing under `tools/art-forge/generate/` may be invoked by any gate, test, or npm script.** It requires a GPU and a Tailscale tunnel to mont-pc.
- **Tests run with `node --test`** from `scripts/` (`npm test --prefix scripts`). No jest, no new test framework.
- **Prettier must pass.** Husky + lint-staged run `prettier --write` on commit for `colyseus-server/src/**/*.ts`; run `npx prettier --write` manually on files outside that glob.
- **Never `git commit --amend`** — always a new commit on top.
- **Work happens in the `_release` worktree on `release/1.6`**, not the main checkout (the PreToolUse guard blocks the main working tree).
- **Per-task quality gate (global rule 7):** implement → verify → independent review of that task's diff → refactor → re-verify. A task is not done until all five pass.
- Exact group ids, verbatim: `cast`, `race`, `class`, `mob`, `boss`, `map`, `town`, `biome`, `item`, `icon`, `crest`.
- Expected counts, verbatim: `race` = 8, `class` = 64.

---

## File Structure

| File | Responsibility |
|---|---|
| `game-client/assets/art/art-groups.json` | **Create.** The group registry — single source of truth for the gate and the storybook. |
| `scripts/check_asset_manifest.mjs` | **Modify.** New `--art-manifest` / `--art-root` flags, `validator` field on sources, `validateArtEntry`, `isLfsPointer`, `assertArtCoverage`, report line. |
| `scripts/tests/check_asset_manifest.test.mjs` | **Create.** There is no existing test for this gate — this file is new. |
| `game-client/assets/art/art-manifest.json` | **Modify.** Mint `art:race-human`. |
| `tools/asset-storybook/index.html` | **Modify.** `buildArt()` group-order table + unregistered-group fallback. |
| `tools/art-forge/README.md` | **Create.** The recipe: mont-pc access, prompt laws, QC method. |
| `tools/art-forge/forge.config.json` | **Create.** Model, denoise, silhouette params. |
| `tools/art-forge/prompts/*.json` | **Create.** Per-group templates + locked race identity canon. |
| `tools/art-forge/generate/*` | **Create.** GPU-bound, human-run, CI-excluded. |
| `tools/art-forge/intake-art.mjs` | **Create.** Transactional intake into `art-manifest.json`. |
| `tools/art-forge/tests/intake-art.test.mjs` | **Create.** Rollback coverage. |

---

### Task 1: Group registry + art validator wired into the gate

**Files:**
- Create: `game-client/assets/art/art-groups.json`
- Create: `scripts/tests/check_asset_manifest.test.mjs`
- Modify: `scripts/check_asset_manifest.mjs` (`parseArgs` ~line 80, `manifestSources` ~line 174, `main` ~line 413, `report` ~line 480)

**Interfaces:**
- Consumes: nothing — first task.
- Produces: `validateArtEntry(id, entry, source, groupIds, failures) -> void`; `manifestSources(opts)` entries now carry `validator: "render" | "art"` and art carries `root: string`; CLI flags `--art-manifest <path>` and `--art-root <dir>`; `game-client/assets/art/art-groups.json` with shape `{ version, groups: [{id,label,track}], expectedCounts: {group:number} }`.

- [ ] **Step 1: Create the group registry**

`game-client/assets/art/art-groups.json`:

```json
{
  "version": 1,
  "groups": [
    { "id": "cast", "label": "Cast", "track": "existing" },
    { "id": "race", "label": "Races", "track": "existing" },
    { "id": "class", "label": "Classes", "track": "existing" },
    { "id": "mob", "label": "Mobs", "track": "T1" },
    { "id": "boss", "label": "Bosses", "track": "T1" },
    { "id": "map", "label": "Maps", "track": "T2" },
    { "id": "town", "label": "Towns", "track": "T2" },
    { "id": "biome", "label": "Biomes", "track": "T2" },
    { "id": "item", "label": "Items", "track": "T3" },
    { "id": "icon", "label": "Element & Class Icons", "track": "T3" },
    { "id": "crest", "label": "Faction Crests", "track": "T3" }
  ],
  "expectedCounts": { "race": 8, "class": 64 }
}
```

> The `icon` label is **"Element & Class Icons"**, not "Icons", because `RENDER_LABELS.image` in `tools/asset-storybook/index.html` already renders a sidebar class labelled "Icons". Two things named "Icons" in one page is a reading bug.

- [ ] **Step 2: Write the failing test**

Create `scripts/tests/check_asset_manifest.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_asset_manifest.mjs");

// A 1x1 PNG — real payload, so the LFS-pointer check has something valid to pass.
const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100" +
    "05fe02fea7b3a4e50000000049454e44ae426082",
  "hex",
);

const GROUPS = {
  version: 1,
  groups: [
    { id: "cast", label: "Cast" },
    { id: "race", label: "Races" },
    { id: "mob", label: "Mobs" },
  ],
  expectedCounts: { race: 2 },
};

// Builds a self-contained fixture tree and returns the flag set that points the
// gate at it. Only the art source varies per test; the other four sources are
// minimal-but-valid so the gate reaches the art code path.
function fixture({ entries, groups = GROUPS, files = ["a.png", "b.png"] }) {
  const dir = mkdtempSync(join(tmpdir(), "artgate-"));
  const artRoot = join(dir, "art");
  mkdirSync(join(artRoot, "concept"), { recursive: true });
  for (const f of files) writeFileSync(join(artRoot, "concept", f), PNG_1X1);

  writeFileSync(join(dir, "art-groups.json"), JSON.stringify(groups));
  writeFileSync(
    join(dir, "art-manifest.json"),
    JSON.stringify({ version: 1, entries }),
  );
  writeFileSync(
    join(dir, "keys.json"),
    JSON.stringify({ version: 1, keys: [] }),
  );
  writeFileSync(
    join(dir, "render-spec.json"),
    JSON.stringify({
      version: 1,
      renderers: { image: { sceneLoadable: false, require: [] } },
      kindDefaultRender: {},
      extRender: { ".png": "image" },
      codegenReservedNamespaces: ["mob:", "item:"],
    }),
  );
  for (const n of ["manifest", "audio", "catalog", "music"])
    writeFileSync(join(dir, `${n}.json`), JSON.stringify({ version: 1, entries: {} }));

  return { dir, artRoot };
}

function runGate({ dir, artRoot }) {
  try {
    const stdout = execFileSync(
      "node",
      [
        GATE,
        "--keys", join(dir, "keys.json"),
        "--render-spec", join(dir, "render-spec.json"),
        "--manifest", join(dir, "manifest.json"),
        "--audio-manifest", join(dir, "audio.json"),
        "--catalog-manifest", join(dir, "catalog.json"),
        "--music-manifest", join(dir, "music.json"),
        "--art-manifest", join(dir, "art-manifest.json"),
        "--art-root", artRoot,
        "--game-client", dir,
      ],
      { encoding: "utf8" },
    );
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || "" };
  }
}

const ok = (over = {}) => ({
  group: "cast",
  title: "A",
  note: "Z-Image Turbo, local generation",
  file: "concept/a.png",
  ...over,
});

test("healthy art manifest passes", () => {
  const f = fixture({
    entries: { "art:cast-a": ok(), "art:cast-b": ok({ file: "concept/b.png", title: "B" }) },
    groups: { ...GROUPS, expectedCounts: {} },
  });
  const r = runGate(f);
  assert.equal(r.code, 0, r.stdout);
});

test("entry pointing at a missing file fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ file: "concept/nope.png" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /art:cast-a.*file not found/);
});

test("undeclared group fails", () => {
  const f = fixture({
    entries: { "art:zzz-a": ok({ group: "zzz" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /not declared in art-groups\.json/);
});

test("missing note fails — provenance is required", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ note: "" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /missing note/);
});

test("absolute or res:// file path fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok({ file: "res://concept/a.png" }) },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /must be a relative path/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release
node --test scripts/tests/check_asset_manifest.test.mjs
```

Expected: FAIL — every test errors, because `--art-manifest` is an unknown argument and the gate exits 2.

- [ ] **Step 4: Add the CLI flags**

In `scripts/check_asset_manifest.mjs`, inside `parseArgs`, add to the `opts` object literal after `musicManifest`:

```js
    artManifest: join(REPO_ROOT, "game-client/assets/art/art-manifest.json"),
    artGroups: join(REPO_ROOT, "game-client/assets/art/art-groups.json"),
    artRoot: join(REPO_ROOT, "game-client/assets/art"),
```

and to the argument loop, after the `--music-manifest` branch:

```js
    else if (a === "--art-manifest") opts.artManifest = resolve(argv[++i]);
    else if (a === "--art-groups") opts.artGroups = resolve(argv[++i]);
    else if (a === "--art-root") opts.artRoot = resolve(argv[++i]);
```

- [ ] **Step 5: Add the `validator` field and the art source**

In `manifestSources(opts)`, add `validator: "render",` to each of the four existing source objects, then append:

```js
    {
      path: opts.artManifest,
      label: "art-manifest",
      keyspace: "curated",
      driftGated: false,
      validator: "art", // concept art is NOT render-spec shaped — see spec §4
      root: opts.artRoot,
    },
```

- [ ] **Step 6: Implement `validateArtEntry`**

Add above `validateEntry` in `scripts/check_asset_manifest.mjs`. Extend the existing `node:fs` import to `import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from "node:fs";`

```js
// (L) Concept-art entries. Curated reference material with NO renderer, so the
// render-spec path in validateEntry() does not apply — see
// docs/superpowers/specs/2026-08-01-art-forge-foundation-design.md §4.
// Licence guard (I) deliberately does not apply either: art is generated
// locally on mont-pc and has no upstream licence, so `note` carries provenance.
function validateArtEntry(id, entry, source, groupIds, failures) {
  if (!entry || typeof entry !== "object") {
    failures.push(`entry "${id}": not an object`);
    return;
  }
  if (typeof entry.group !== "string" || !groupIds.has(entry.group)) {
    failures.push(
      `entry "${id}": group "${entry.group}" is not declared in art-groups.json`,
    );
  }
  if (isEmptyField(entry.title)) failures.push(`entry "${id}": missing title`);
  if (isEmptyField(entry.note)) {
    failures.push(
      `entry "${id}": missing note — provenance is required (art carries no upstream licence)`,
    );
  }

  const file = entry.file;
  if (typeof file !== "string" || file.trim() === "") {
    failures.push(`entry "${id}": missing file`);
    return;
  }
  if (
    file.startsWith("res://") ||
    file.startsWith("/") ||
    file.split("/").includes("..")
  ) {
    failures.push(
      `entry "${id}": file must be a relative path under the art root — got "${file}"`,
    );
    return;
  }

  const fsPath = join(source.root, file);
  if (!existsSync(fsPath)) {
    failures.push(`entry "${id}": file not found — ${file}`);
    return;
  }
  const st = statSync(fsPath);
  if (!st.isFile() || st.size === 0) {
    failures.push(`entry "${id}": file is empty or not a regular file — ${file}`);
  }
}
```

- [ ] **Step 7: Branch on the validator in `main()`**

Read the group registry once, before the source loop (after `keyIds` is built):

```js
  const groupsDoc = readJson(opts.artGroups, "art-groups", failures);
  const groupIds = new Set(
    groupsDoc && Array.isArray(groupsDoc.groups)
      ? groupsDoc.groups.map((g) => g && g.id).filter(Boolean)
      : [],
  );
```

Then inside the per-entry loop replace the single `validateEntry(...)` call with:

```js
      if (source.validator === "art") {
        validateArtEntry(id, entry, source, groupIds, failures);
      } else {
        validateEntry(id, entry, source, opts.gameClient, spec, failures);
      }
      assertNoReserved(id, source, spec, failures);
```

- [ ] **Step 8: Add the report line**

In `report()`, after the `music-manifest` line:

```js
  console.log(`  art-manifest:      ${opts.artManifest}`);
```

- [ ] **Step 9: Run the tests**

```bash
node --test scripts/tests/check_asset_manifest.test.mjs
```

Expected: PASS — 5 passing.

- [ ] **Step 10: Run the gate against the real repo**

```bash
node scripts/check_asset_manifest.mjs; echo "exit=$?"
```

Expected: exit 1 with exactly one class of new failure — `art group "race": expected 8 entries, found 7` is **not** yet implemented (Task 3), so at this point expect **exit 0** with the 80 art entries validating cleanly. If any art entry fails, fix the validator before continuing — do not edit the manifest to suit the gate.

- [ ] **Step 11: Commit**

```bash
npx prettier --write scripts/check_asset_manifest.mjs scripts/tests/check_asset_manifest.test.mjs game-client/assets/art/art-groups.json
git add game-client/assets/art/art-groups.json scripts/check_asset_manifest.mjs scripts/tests/check_asset_manifest.test.mjs
git commit -m "feat(gate): validate art-manifest.json with a dedicated art validator"
```

---

### Task 2: LFS-pointer detection

**Files:**
- Modify: `scripts/check_asset_manifest.mjs`
- Modify: `scripts/tests/check_asset_manifest.test.mjs`

**Interfaces:**
- Consumes: `validateArtEntry` from Task 1.
- Produces: `isLfsPointer(fsPath) -> boolean`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/check_asset_manifest.test.mjs`:

```js
test("a Git LFS pointer stub fails instead of passing as an image", () => {
  const f = fixture({
    entries: { "art:cast-a": ok() },
    groups: { ...GROUPS, expectedCounts: {} },
    files: ["a.png"],
  });
  // Overwrite the real PNG with what a fresh clone without `git lfs pull` has.
  writeFileSync(
    join(f.artRoot, "concept/a.png"),
    "version https://git-lfs.github.com/spec/v1\noid sha256:deadbeef\nsize 12345\n",
  );
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Git LFS pointer/);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --test scripts/tests/check_asset_manifest.test.mjs
```

Expected: FAIL — the pointer stub is a non-empty regular file, so Task 1's validator passes it. Exit code is 0, the assertion on `r.code` fails.

- [ ] **Step 3: Implement `isLfsPointer`**

Add above `validateArtEntry`:

```js
// A Git LFS pointer is a small text file that begins with this exact line. A
// fresh clone without `git lfs pull` has pointers where the images should be —
// they are non-empty regular files, so a size check alone lets them through.
const LFS_MAGIC = "version https://git-lfs.github.com/spec/v1";

function isLfsPointer(fsPath) {
  let fd;
  try {
    fd = openSync(fsPath, "r");
    const buf = Buffer.alloc(LFS_MAGIC.length);
    const n = readSync(fd, buf, 0, LFS_MAGIC.length, 0);
    return n === LFS_MAGIC.length && buf.toString("utf8") === LFS_MAGIC;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
```

- [ ] **Step 4: Call it**

At the end of `validateArtEntry`, replace the final size check block with:

```js
  if (!st.isFile() || st.size === 0) {
    failures.push(`entry "${id}": file is empty or not a regular file — ${file}`);
    return;
  }
  if (isLfsPointer(fsPath)) {
    failures.push(
      `entry "${id}": file is a Git LFS pointer, not image payload — run \`git lfs pull\` (${file})`,
    );
  }
```

- [ ] **Step 5: Run the tests**

```bash
node --test scripts/tests/check_asset_manifest.test.mjs
```

Expected: PASS — 6 passing.

- [ ] **Step 6: Verify against the real repo**

```bash
head -c 45 game-client/assets/art/concept/cast-liss.png | cat -v
node scripts/check_asset_manifest.mjs; echo "exit=$?"
```

Expected: the `head` shows `\x89PNG` (real payload, already confirmed), and the gate still exits 0.

- [ ] **Step 7: Commit**

```bash
npx prettier --write scripts/check_asset_manifest.mjs scripts/tests/check_asset_manifest.test.mjs
git add scripts/check_asset_manifest.mjs scripts/tests/check_asset_manifest.test.mjs
git commit -m "feat(gate): fail art entries whose file is an LFS pointer stub"
```

---

### Task 3: Orphan scan + group-count completeness

**Files:**
- Modify: `scripts/check_asset_manifest.mjs`
- Modify: `scripts/tests/check_asset_manifest.test.mjs`

**Interfaces:**
- Consumes: `manifestSources` art source (`source.root`) from Task 1; `groupsDoc` from Task 1 step 7.
- Produces: `assertArtCoverage(entries, source, groupsDoc, failures) -> void`; `walkImages(dir)` generator.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/check_asset_manifest.test.mjs`:

```js
test("an image on disk with no manifest entry fails", () => {
  const f = fixture({
    entries: { "art:cast-a": ok() }, // b.png exists on disk but is unclaimed
    groups: { ...GROUPS, expectedCounts: {} },
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /no manifest entry.*b\.png/);
});

test("a group short of its expected count fails", () => {
  const f = fixture({
    entries: {
      "art:race-a": ok({ group: "race" }),
      "art:race-b": ok({ group: "race", file: "concept/b.png" }),
      "art:race-c": ok({ group: "race", file: "concept/c.png" }),
    },
    groups: { ...GROUPS, expectedCounts: { race: 8 } },
    files: ["a.png", "b.png", "c.png"],
  });
  const r = runGate(f);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /group "race": expected 8 entries, found 3/);
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node --test scripts/tests/check_asset_manifest.test.mjs
```

Expected: FAIL on both — neither assertion exists yet, so the gate exits 0.

- [ ] **Step 3: Implement the coverage assertions**

Extend the `node:path` import to `import { dirname, resolve, join, relative } from "node:path";` and the `node:fs` import to include `readdirSync`. Add after `assertNoReserved`:

```js
const ART_IMAGE_EXT = new Set([".png", ".webp", ".jpg", ".jpeg"]);

function* walkImages(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkImages(p);
      continue;
    }
    const dot = ent.name.lastIndexOf(".");
    const ext = dot === -1 ? "" : ent.name.slice(dot).toLowerCase();
    if (ART_IMAGE_EXT.has(ext)) yield p;
  }
}

// (M) Reverse direction + group completeness. Rule (L) catches an entry whose
// file vanished; this catches the opposite — a committed image nothing points
// at, which is invisible forever — and a group that silently lost a member
// (the exact 7-vs-8 races symptom that went unnoticed).
function assertArtCoverage(entries, source, groupsDoc, failures) {
  const claimed = new Set();
  const counts = {};
  for (const entry of Object.values(entries)) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.file === "string" && entry.file.trim() !== "") {
      claimed.add(resolve(source.root, entry.file));
    }
    if (typeof entry.group === "string") {
      counts[entry.group] = (counts[entry.group] || 0) + 1;
    }
  }

  for (const abs of walkImages(source.root)) {
    if (!claimed.has(resolve(abs))) {
      failures.push(
        `art file has no manifest entry: ${relative(source.root, abs)}`,
      );
    }
  }

  for (const [group, expected] of Object.entries(
    (groupsDoc && groupsDoc.expectedCounts) || {},
  )) {
    const actual = counts[group] || 0;
    if (actual !== expected) {
      failures.push(
        `art group "${group}": expected ${expected} entries, found ${actual}`,
      );
    }
  }
}
```

- [ ] **Step 4: Call it from `main()`**

Inside the source loop, immediately after the per-entry `for` loop closes, add:

```js
    if (source.validator === "art") {
      assertArtCoverage(entries, source, groupsDoc, failures);
    }
```

- [ ] **Step 5: Run the tests**

```bash
node --test scripts/tests/check_asset_manifest.test.mjs
```

Expected: PASS — 8 passing.

- [ ] **Step 6: Run against the real repo and confirm it catches the known bug**

```bash
node scripts/check_asset_manifest.mjs; echo "exit=$?"
```

Expected: **exit 1** with `art group "race": expected 8 entries, found 7`. This is the gate correctly finding the missing `art:race-human` — Task 4 fixes it. Record the exact output; this is the red half of red-green for Task 4.

- [ ] **Step 7: Commit**

```bash
npx prettier --write scripts/check_asset_manifest.mjs scripts/tests/check_asset_manifest.test.mjs
git add scripts/check_asset_manifest.mjs scripts/tests/check_asset_manifest.test.mjs
git commit -m "feat(gate): scan for orphan art images and assert group counts"
```

---

### Task 4: Mint `art:race-human`

**Files:**
- Modify: `game-client/assets/art/art-manifest.json`

**Interfaces:**
- Consumes: the `expectedCounts.race = 8` assertion from Task 3.
- Produces: manifest key `art:race-human`.

- [ ] **Step 1: Confirm the gate is red for the right reason**

```bash
node scripts/check_asset_manifest.mjs 2>&1 | grep 'group "race"'
```

Expected: `art group "race": expected 8 entries, found 7`.

- [ ] **Step 2: Identify the cast image human reuses**

```bash
python3 -c "
import json
e=json.load(open('game-client/assets/art/art-manifest.json'))['entries']
for k,v in e.items():
    if v.get('group')=='cast': print(k, '->', v['file'])
"
```

`HANDOFF-2026-07-28.md:20` records *"Races 8 — Human(=cast)"*. Pick the cast sheet that heads the class grid — `art:cast-crossroads-man-sheet` (the 4-view turnaround) unless the owner names a different one. **If the choice is not obvious from the output, stop and ask** rather than guessing; this is a canon-visible decision.

- [ ] **Step 3: Add the entry**

Insert into `entries` in `game-client/assets/art/art-manifest.json`, immediately before `art:race-demon`:

```json
    "art:race-human": {
      "group": "race",
      "title": "Human",
      "file": "concept/cast-crossroads-man-sheet.png",
      "note": "Deliberate reuse: the human race lineup uses the approved cast turnaround rather than a separate render. Recorded explicitly so a 7-of-8 race group can never again be mistaken for an omission."
    },
```

- [ ] **Step 4: Run the gate**

```bash
node scripts/check_asset_manifest.mjs; echo "exit=$?"
```

Expected: exit 0. The `race` group is now 8 and the reused file is already claimed by the cast entry, so the orphan scan is unaffected (it checks disk→manifest, and two entries may share one file).

- [ ] **Step 5: Run the full gate test suite**

```bash
npm test --prefix scripts
```

Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add game-client/assets/art/art-manifest.json
git commit -m "fix(art): mint art:race-human explicitly instead of leaving the race group at 7"
```

---

### Task 5: Storybook renders every group

**Files:**
- Modify: `tools/asset-storybook/index.html` (constants ~line 782, `buildArt` ~line 2211, call site ~line 2738)

**Interfaces:**
- Consumes: `art-groups.json` from Task 1.
- Produces: `buildArt(artEntries, artGroups)` — signature changes, one call site.

- [ ] **Step 1: Add the registry URL constant**

Next to `ART_MANIFEST_URL` (~line 782):

```js
      const ART_GROUPS_URL = "../../game-client/assets/art/art-groups.json";
      // Fallback preserves the pre-T0 behaviour if the registry is unavailable,
      // so a missing file degrades the section rather than breaking the page.
      const ART_GROUPS_FALLBACK = [
        { id: "cast", label: "Cast" },
        { id: "race", label: "Races" },
        { id: "class", label: "Classes" },
      ];
```

- [ ] **Step 2: Replace `buildArt`**

Replace the whole function at ~line 2211:

```js
      function buildArt(artEntries, artGroups) {
        const container = document.createElement("div");
        const order =
          (artGroups && Array.isArray(artGroups.groups) && artGroups.groups.length
            ? artGroups.groups
            : ART_GROUPS_FALLBACK);

        const buckets = new Map(order.map((g) => [g.id, []]));
        const unregistered = new Map();

        for (const [id, entry] of Object.entries(artEntries)) {
          if (!entry || typeof entry.file !== "string") continue;
          const g = typeof entry.group === "string" ? entry.group : "cast";
          if (buckets.has(g)) {
            buckets.get(g).push([id, entry]);
          } else {
            // Never fold an unknown group into Cast — that hid every T1-T3
            // group behind the wrong heading before T0.
            if (!unregistered.has(g)) unregistered.set(g, []);
            unregistered.get(g).push([id, entry]);
          }
        }

        for (const g of order) {
          const list = buckets.get(g.id);
          if (!list || list.length === 0) continue;
          container.appendChild(
            g.id === "class"
              ? buildArtClasses(list)
              : buildArtGroup(g.label || g.id, list),
          );
        }

        for (const [gid, list] of [...unregistered].sort((a, b) =>
          a[0].localeCompare(b[0]),
        )) {
          container.appendChild(buildArtGroup(gid + " (unregistered)", list));
        }

        return container;
      }
```

- [ ] **Step 3: Fetch the registry and pass it through**

Next to the existing `art-manifest` fetch (~line 2536), which already tolerates a missing file, add the same treatment for the registry, then update the call site (~line 2738) from `buildArt(artEntries)` to `buildArt(artEntries, artGroups)`.

```js
        let artGroups = null;
        try {
          artGroups = await fetchJson(ART_GROUPS_URL, "art-groups");
        } catch (e) {
          console.warn(
            "[asset-storybook] art-groups.json unavailable — falling back to cast/race/class order:",
            e,
          );
        }
```

- [ ] **Step 4: Verify in a browser — this is the only verification this task has**

There is no headless harness for `index.html` (spec §6). Serve and look:

```bash
python3 -m http.server 8793 >/dev/null 2>&1 &
open -a "Google Chrome" "http://127.0.0.1:8793/tools/asset-storybook/index.html#section-art"
```

Confirm: **Concept Art (81)** with `Cast (9)` · `Races (8)` · `Classes (64)`.

Then prove the fallback works — temporarily add a probe entry with `"group": "mob"`, reload **on a fresh port** (Chrome serves the manifest from cache otherwise — this bit us during design), and confirm it renders under its own **Mobs** heading and *not* inside Cast. Revert the probe with `git checkout -- game-client/assets/art/art-manifest.json` and kill the servers.

- [ ] **Step 5: Commit**

```bash
npx prettier --write tools/asset-storybook/index.html
git add tools/asset-storybook/index.html
git commit -m "fix(storybook): render every art group instead of folding unknowns into Cast"
```

---

### Task 6: `tools/art-forge/` recipe, config, and prompts

**Files:**
- Create: `tools/art-forge/README.md`, `tools/art-forge/forge.config.json`, `tools/art-forge/prompts/race-identity.json`, `tools/art-forge/prompts/style-laws.json`, `tools/art-forge/.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `forge.config.json` shape `{ version, model, sampler: { denoise, steps, cfg }, silhouettes: { dir, prefix }, comfy: { host, port, gpu } }`; `prompts/style-laws.json` shape `{ positive: string[], negative: string[] }`; `prompts/race-identity.json` shape `{ [race]: { identity: string[], muscle: number } }`.

- [ ] **Step 1: Write `forge.config.json`**

Values are transcribed verbatim from `HANDOFF-2026-07-28.md` §2 — do not re-tune them.

```json
{
  "version": 1,
  "model": "Z-Image Turbo",
  "sampler": { "denoise": 0.82, "mode": "img2img" },
  "silhouettes": {
    "dir": "F:\\comfy-ui\\input",
    "prefix": "sil-",
    "note": "Flat-grey per-job silhouettes cut from the approved human row via ImageMagick magenta-key. Proportion and pose come from the silhouette; race and costume come from the prompt."
  },
  "comfy": {
    "host": "100.66.190.100",
    "port": 8188,
    "gpu": 0,
    "launchScript": "C:\\Users\\Mont\\run-comfy-gpu0.cmd",
    "warning": "GPU 1 : 8189 is the owner's own instance — do not touch it."
  },
  "muscleGradient": {
    "raceAxis": ["elf", "beastkin", "immortal", "human", "demon", "dragon", "dwarf", "ogre"],
    "jobAxis": ["mage", "healer", "summoner", "engineer", "assassin", "archer", "spearman", "swordsman"],
    "scoreRange": [6.0, 8.5]
  }
}
```

- [ ] **Step 2: Write `prompts/style-laws.json`**

```json
{
  "positive": ["crisp flat 2D anime illustration"],
  "negative": ["NOT 3D render", "NOT CGI", "NOT clay", "no fur"],
  "laws": [
    "Text alone CANNOT hold head-body ratio — always anchor with an image. The owner caught drift twice on text-only attempts.",
    "The words 'raccoon', 'goggles' and 'dwarf' drag the model toward 3D-furry/Pixar. Counter with 'KEMONOMIMI, HUMAN face, no fur'.",
    "QC per row on a contact sheet, then reroll only failing cells with a new seed plus reinforced identity words."
  ]
}
```

- [ ] **Step 3: Write `prompts/race-identity.json`**

These are locked by owner iteration and referenced by `content/story/canon.md` §5 — drift here is drift against canon.

```json
{
  "ogre": { "identity": ["moss-green skin", "small tusks", "intelligent eyes", "natural muscle"], "muscle": 8.5 },
  "immortal": { "identity": ["halo is a ring of LIGHT, not bells"], "muscle": 6.8 },
  "dragon": { "identity": ["white hair", "pearl-opal iridescent skin"], "muscle": 7.4 },
  "beastkin": { "identity": ["HUMAN face", "animal ears and tail only", "KEMONOMIMI", "no fur"], "muscle": 6.4 },
  "elf": { "identity": ["slender", "mana-bright"], "muscle": 6.0 },
  "dwarf": { "identity": ["stocky", "artisan"], "muscle": 7.8 },
  "demon": { "identity": ["void affinity"], "muscle": 7.0 },
  "human": { "identity": ["balanced, no lean"], "muscle": 7.0 }
}
```

- [ ] **Step 4: Write `README.md`**

It must contain, in this order: the mont-pc access path (Tailscale `100.66.190.100`, user `mont`, key auth, the SSH tunnel command `ssh -f -N -L 8188:127.0.0.1:8188 -o ServerAliveInterval=30 mont@100.66.190.100`); the launch script and the GPU-1 warning; the winning v3 recipe; the prompt laws; the QC contact-sheet method (`magick montage ... -tile 8x8`); and a prominent statement that **nothing in `generate/` runs in CI**.

- [ ] **Step 5: Write `.gitignore`**

```
out/
*.png
```

Generated images land in `out/` and are only committed via `intake-art.mjs` (Task 8), which copies them into `game-client/assets/art/`.

- [ ] **Step 6: Verify**

```bash
node -e "for (const f of ['forge.config.json','prompts/style-laws.json','prompts/race-identity.json']) { JSON.parse(require('fs').readFileSync('tools/art-forge/'+f,'utf8')); console.log('ok', f); }"
grep -c "generate/" tools/art-forge/README.md
```

Expected: three `ok` lines and a non-zero grep count.

- [ ] **Step 7: Commit**

```bash
npx prettier --write "tools/art-forge/**/*.json"
git add tools/art-forge
git commit -m "docs(art-forge): commit the Z-Image recipe, config, and locked race identity canon"
```

---

### Task 7: Reconstruct the generation scripts

**Files:**
- Create: `tools/art-forge/generate/charsheet.mjs`, `tools/art-forge/generate/i2i.mjs`, `tools/art-forge/generate/batch-matrix.mjs`, `tools/art-forge/generate/contact-sheet.sh`

**Interfaces:**
- Consumes: `forge.config.json`, `prompts/*.json` from Task 6.
- Produces: CLI entry points writing PNGs into `tools/art-forge/out/`. **No exports consumed by later tasks** — Task 8's intake takes a file path, not a generator.

<div class="callout danger">
These scripts talk to ComfyUI over HTTP through the tunnel. They cannot be tested in CI and MUST NOT be imported by any test or gate.
</div>

- [ ] **Step 1: Confirm reachability before writing anything**

```bash
ssh -f -N -L 8188:127.0.0.1:8188 -o ServerAliveInterval=30 mont@100.66.190.100
curl -s http://127.0.0.1:8188/system_stats | head -c 200
```

Expected: a JSON blob naming the GPU. **If this fails, stop and report** — reconstructing generation scripts that cannot be run is guesswork, and the spec's §8 risk row exists for exactly this. Tasks 1–6 and 8 do not depend on it.

- [ ] **Step 2: Write `charsheet.mjs` (txt2img)**

Posts a ComfyUI txt2img workflow built from `forge.config.json` + `prompts/style-laws.json`, polls `/history/<prompt_id>` until complete, and writes the result to `out/`. CLI: `node generate/charsheet.mjs --race human --job swordsman --seed 12345`.

- [ ] **Step 3: Write `i2i.mjs` (img2img — the winning recipe)**

Same transport, but posts an img2img workflow at `denoise` from config (0.82) with `input/sil-<job>.png` as the latent source. CLI: `node generate/i2i.mjs --race ogre --job mage --seed 12345`.

- [ ] **Step 4: Write `batch-matrix.mjs`**

Iterates the full race × job matrix from `forge.config.json.muscleGradient`, calling the same code path as `i2i.mjs` per cell, applying the per-race identity words from `prompts/race-identity.json` and the muscle score. CLI: `node generate/batch-matrix.mjs --races all --jobs all` and `--races ogre --jobs mage,healer` for rerolls.

- [ ] **Step 5: Write `contact-sheet.sh`**

```bash
#!/usr/bin/env bash
# QC one race row as a single contact sheet. Reroll only the failing cells.
set -euo pipefail
race="${1:?usage: contact-sheet.sh <race>}"
magick montage "out/${race}-"*.png -tile 8x8 -geometry +4+4 "out/_sheet-${race}.png"
echo "wrote out/_sheet-${race}.png"
```

- [ ] **Step 6: Verify by regenerating ONE existing cell and comparing**

Regenerate a cell that already exists in the committed set and compare visually against it. This is the only meaningful proof the reconstruction matches the house style.

```bash
node generate/i2i.mjs --race ogre --job mage --seed 12345
open -a "Google Chrome" tools/art-forge/out/ogre-mage.png game-client/assets/art/concept/class-ogre-mage.png
```

Expected: same flat-2D style, same proportions, same race identity markers. **A mismatch means stop** — report it rather than committing a generator that produces off-style art. Do **not** intake the output; T0 ships no artwork.

- [ ] **Step 7: Confirm nothing in CI touches these**

```bash
grep -rn "art-forge/generate" .github scripts tools --include="*.yml" --include="*.sh" --include="*.mjs" --include="*.json" | grep -v "tools/art-forge/"
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add tools/art-forge/generate
git commit -m "feat(art-forge): reconstruct the ComfyUI generation scripts (human-run, CI-excluded)"
```

---

### Task 8: Transactional intake

**Files:**
- Create: `tools/art-forge/intake-art.mjs`, `tools/art-forge/tests/intake-art.test.mjs`, `tools/art-forge/package.json`

**Interfaces:**
- Consumes: `writeManifestAtomic(manifestPath, manifestObj)` and `readManifest(manifestPath)` from `tools/asset-forge/lib/manifest.mjs`; the gate CLI from Tasks 1–3; `art-groups.json` from Task 1.
- Produces: `intakeArt({ src, id, group, title, note, root, manifestPath, driftGateRunner }) -> Promise<{ ok: boolean, id: string }>`.

- [ ] **Step 1: Write the failing rollback test**

Create `tools/art-forge/tests/intake-art.test.mjs`. Mirror `tools/asset-2d-forge/tests/intake2d.test.mjs`, which already injects the real gate as a runner. The load-bearing test:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { intakeArt } from "../intake-art.mjs";

test("a failing gate rolls back to the exact prior bytes and leaves no PNG", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artintake-"));
  const root = join(dir, "art");
  mkdirSync(join(root, "concept"), { recursive: true });
  const manifestPath = join(root, "art-manifest.json");
  const before = JSON.stringify({ version: 1, entries: {} }, null, 2) + "\n";
  writeFileSync(manifestPath, before);
  const src = join(dir, "new.png");
  writeFileSync(src, Buffer.from("89504e470d0a1a0a", "hex"));

  const res = await intakeArt({
    src,
    id: "art:mob-wolf",
    group: "mob",
    title: "Wolf",
    note: "Z-Image Turbo, local generation",
    root,
    manifestPath,
    driftGateRunner: async () => ({ ok: false, output: "synthetic gate failure" }),
  });

  assert.equal(res.ok, false);
  assert.equal(readFileSync(manifestPath, "utf8"), before, "manifest not restored");
  assert.equal(existsSync(join(root, "concept/new.png")), false, "copied PNG not removed");
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --test tools/art-forge/tests/intake-art.test.mjs
```

Expected: FAIL — `Cannot find module '../intake-art.mjs'`.

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "@atlas/art-forge",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/*.test.mjs" }
}
```

- [ ] **Step 4: Implement `intake-art.mjs`**

Follow `tools/asset-2d-forge/intake2d.mjs` order-of-operations exactly: **validate** (src exists; `id` starts with `art:`; `group` is declared in `art-groups.json`; `title` and `note` non-empty; the destination does not already have a different file) → **snapshot** (read the manifest's exact bytes, and any PNG already at the destination) → **copy** into `<root>/concept/` → **write-entry** via `writeManifestAtomic` → **gate** (spawn `node scripts/check_asset_manifest.mjs`) → **rollback** on failure (restore the snapshot bytes, delete the copied PNG). Any validation failure aborts with **zero** side effects. Expose `driftGateRunner` as an injectable option, defaulting to a real spawn — that is how the test above substitutes a synthetic failure.

- [ ] **Step 5: Run the tests**

```bash
node --test tools/art-forge/tests/intake-art.test.mjs
```

Expected: PASS.

- [ ] **Step 6: End-to-end check with the real gate**

Intake a throwaway copy of an existing PNG under a `mob` id, confirm the gate passes and the entry lands, then revert:

```bash
cp game-client/assets/art/concept/cast-liss.png /tmp/probe-wolf.png
node tools/art-forge/intake-art.mjs --src /tmp/probe-wolf.png --id art:mob-probe \
  --group mob --title "Probe" --note "throwaway, reverted"
node scripts/check_asset_manifest.mjs; echo "exit=$?"
git checkout -- game-client/assets/art/art-manifest.json
rm -f game-client/assets/art/concept/probe-wolf.png
git status --short
```

Expected: gate exits 0 with the probe present; a clean tree after revert.

- [ ] **Step 7: Wire the suite into Gate 2**

In `scripts/integration.sh`, add alongside `explorer_smoke`:

```bash
art_forge_tests() { (cd "$REPO_ROOT" && node --test tools/art-forge/tests/*.test.mjs); }
```

and register it: `run_section "art-forge: intake tests" art_forge_tests`.

- [ ] **Step 8: Run the full gates**

```bash
npm test --prefix scripts
node scripts/check_asset_manifest.mjs; echo "gate=$?"
bash scripts/integration.sh --no-install; echo "gate2=$?"
```

Expected: all pass, both exit 0.

- [ ] **Step 9: Commit**

```bash
npx prettier --write tools/art-forge/intake-art.mjs tools/art-forge/tests/intake-art.test.mjs tools/art-forge/package.json
git add tools/art-forge scripts/integration.sh
git commit -m "feat(art-forge): transactional art intake with rollback, wired into Gate 2"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 component split (`generate/` isolation) | 6, 7 (step 7 asserts it) |
| §2 data flow / reuse of `writeManifestAtomic` | 8 |
| §3 preserved tuning (recipe, prompt laws, muscle gradient, race identity) | 6 |
| §4 assertion 1 (file resolves) | 1 |
| §4 assertion 2 (reverse direction) | 3 |
| §4 assertion 3 (LFS pointer) | 2 |
| §4 assertion 4 (group counts) | 3 |
| §4 assertion 5 (group ∈ known set) | 1 |
| §4 per-source `validator` + `validateArtEntry` | 1 |
| §4 `art:race-human` | 4 |
| §5 reserved keyspace | 1 (`art-groups.json`) |
| §5.1 storybook renderer | 5 |
| §6 tests | 1, 2, 3, 8 |

No spec requirement is unassigned.

**Known risk carried into execution:** Task 7 depends on mont-pc being reachable. Its step 1 is an explicit stop-gate, and no other task depends on Task 7 — if the machine is unavailable, Tasks 1–6 and 8 still deliver the gate, the registry, the storybook fix, and the intake. Report the omission rather than writing untestable generators.
