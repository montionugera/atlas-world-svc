# Maro Bell arrival: environment pilot pieces in game, grey box re-blocked for the 1.30 m canon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (owner, verbatim):** "Ok" to: run E3 as a ps-release-workflow feature in the game repo: bring the 3 E2 pilot models + recipes into the game, re-block the Maro Bell grey box for the 1.30 m player, ship into release 1.34, local deploy so it shows in the app.

**Architecture:** One new optional block field `assetPath` (manifest key) makes `SpawnGreyBlock` draw a glb on a block footprint, with a BoxMesh fallback. The map JSON gets canon heights, resized gate blocks, 14 lantern `assetPath`s, 2 barrel props and 2 edited obstacle rows. The 3 glbs are committed as LFS files with manifest entries, thumbs and ledger rows. The licence value is the LAST task (spec O1, still open).

**Tech Stack:** Node `node:test` (`scripts/tests`), Godot 4.7.2 mono C# (`game-client/src/World`), `scripts/godot-verify.sh`, `scripts/check_asset_manifest.mjs`, `scripts/bake_thumbnails.mjs` (headless Blender via the machine lock), Git LFS, psrw.

**Spec (source of truth, do not edit):** `docs/superpowers/specs/2026-11-15-i303-maro-bell-arrival-env-design.md`

Batch: 3,4

## Global Constraints

- Feature F-218 (idea I-303), repo `atlas-world-svc`, release 1.34, PUBLIC GitHub repo. All paths below are relative to the repo root of the per-feature worktree made by `psrw claim F-218` (cut from main, then `psrw sync`).
- Tasks run sequentially in ONE worktree (shared files). One Godot process at a time. One Blender at a time: every Blender call goes through `python3 /Users/pasitnusso/asset-studio-private/atlas-3d-plan/lib/factory/blender_lock.py <label> -- <cmd...>` (usage: `blender_lock.py [--floor-pct N] <label> -- <cmd...>`, `blender_lock.py:141-154`; never edit it).
- The env lane `/Users/pasitnusso/asset-studio-private/atlas-3d-plan` is READ-ONLY. Source glbs: `env/pilot/r01/r01-4k.glb`, `env/pilot/r04/r04.glb`, `env/pilot/r15/r15.glb`.
- NOTHING containing the glbs is pushed until Task 9 (licence) is done: no `git push` of the feature branch, no `psrw ship`, no `gh pr`.
- New commits only (never amend), one per logical unit, each message ends with the line `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Run `npx prettier --write` and `npx eslint --fix` on touched JS/MJS.
- Do not edit files owned by in-flight work (spec "Overlap with in-flight work"): `VerticalSliceRoot.cs`, `PlaytestSandboxRoot.cs`, `TerrainElevation.cs`, any toon/outline shader, and the Game DB explorer code (F-216, F-198, F-199). Only `content/concept-art/index.json` + `images/` + `thumbs/` data is touched for the Game DB.
- Not in scope: other 13 recipe rows, player/NPC scale (B1: player unchanged), road width, bell tower, lights/perf, Godot web export. Server Rust code: zero changes.
- Godot: `GODOT=~/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot`. `PATH` godot is the non-mono build and proves nothing (`scripts/godot-verify.sh:2-4`).
- Map JSON format: 1-space indent, trailing newline (verified: `json.dumps(d, indent=1, ensure_ascii=False) + "\n"` equals the file byte for byte). All map edits use that dump so the diff is only the intended rows.
- Canon sizes (spec): player 1.30 m, doors >= 3.0 m, house 6-7 m, gate tower 7.1 m, lantern post 3.1 m, barrel 0.75 m.

---

## Phase A: tests first, then data

### Task 0: Claim, worktree, baseline

**Files:** none (workflow state only).

- [ ] **Step 0: Commit this plan on release/1.34 first.** `plan.md` is uncommitted in `_release` (`git status`: ` M .claude/refined_backlog/F-218-.../plan.md`); the feature worktree is cut from main then `psrw sync`, so it would not contain the plan. Commit it from `_release` (backlog metadata only, no push).
- [ ] **Step 1: Claim the feature.** Run from the repo root (the `_release` worktree is only for backlog commits):
  `psrw claim F-218` then `cd` into the printed worktree and run `psrw sync`.
  Expected: a worktree with `working-feature.json` for F-218 on a `feat/...` branch; `psrw status` lists F-218 as claimed.
- [ ] **Step 2: Machine prerequisites.** `git lfs install && git lfs version` (`.gitattributes:2` prerequisite). `test -x "$GODOT" && "$GODOT" --version | grep -q '\.mono\.' && echo OK`. Expected `OK`. Asset Studio must be up for Gate 1 (spec AC8; `precheck.sh:519-524`); note the state, do not fix it here.
- [ ] **Step 3: Baseline.** `node --test scripts/tests/maro-bell.test.mjs` and `node scripts/check_asset_manifest.mjs`. Also record `git ls-files game-client/studio-cache | wc -l` (Task 5 Step 4 compares against it).
  Expected: maro-bell tests pass (all current tests), manifest check no FAILURE. Record the UNKNOWN warning count so Task 5 can show exactly 3 new ones.
- [ ] **Step 4: Baseline the obstacle rows** for AC4: `git show HEAD:content/maps/maro-bell.json > "$TMPDIR/maro-bell.base.json"` (use the scratchpad dir). Expected: file exists, 42 `staticObstacles`.

### Task 1: Failing tests for the map, the lantern, the manifest (spec "New tests", AC3, AC4)

**Files:**
- Modify: `scripts/tests/maro-bell.test.mjs:5` (import) and append tests at the end (existing helpers `doc`, `byId`, `CX`, `CY`, `ROOT`, `rectOf`, `solid` at lines 11-22 are reused).
- Read: `game-client/src/World/MaroBellPocController.cs:28` (`Lantern06WorldPos`).

**Interfaces:**
- Produces (pinned names Task 3 must create in `MaroBellPocController.cs`): `public const float WorkshopLanternLampY = 2.8f;` and `public const float WorkshopLanternLabelY = 3.4f;` (lamp y inside the 2.5-3.1 cage; label >= 3.1 + 0.2).
- Produces (pinned manifest keys Task 5 must create in `game-client/assets/manifest.json` `entries`): `env:maro-gate-tower`, `env:maro-lantern-post`, `env:maro-barrel`.

- [ ] **Step 1: Change the import** at line 5 to `import { readFileSync, existsSync, statSync } from "node:fs";`.
- [ ] **Step 2: Append the new tests.**

```js
// ---- F-218 / I-303: canon re-block, gate tower art, lantern post, barrels ----
const near = (a, b, t) => Math.abs(a - b) <= t;
const manifest = JSON.parse(readFileSync(resolve(ROOT, "game-client/assets/manifest.json"), "utf8")).entries;
const pocSrc = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellPocController.cs"), "utf8");
const lanterns = doc.structures.filter((s) => /^lantern-\d+$/.test(s.id));

test("canon block heights (spec re-block table)", () => {
  for (const id of ["amber-shop", "bram-house", "tovin-shrine"]) assert.ok(near(byId.get(id).size.y, 6.5, 0.01), `${id}.y`);
  assert.equal(lanterns.length, 14);
  for (const s of lanterns) assert.ok(near(s.size.y, 3.1, 0.01), `${s.id}.y`);
  assert.ok(near(byId.get("amber-shop").size.x, 7, 0.01) && near(byId.get("amber-shop").size.z, 6, 0.01), "footprint unchanged");
});

test("gate towers match the r01 art footprint, inner faces stay at +-2.0 m", () => {
  for (const id of ["gate-west", "gate-east"]) {
    const g = byId.get(id);
    assert.ok(near(Math.abs(g.x) - g.size.x / 2, 2.0, 0.01), `${id} inner face`);
    assert.ok(near(g.size.x, 3.74, 0.01) && near(g.size.y, 7.1, 0.01) && near(g.size.z, 2.37, 0.01), `${id} size`);
    assert.equal(g.rotY, 0);
    assert.equal(g.z, 76);
    assert.ok(!("assetOffset" in g), "no assetOffset");
    assert.equal(g.assetPath, "env:maro-gate-tower");
  }
});

test("only the 2 gate obstacle rows changed, with the spec values", () => {
  const want = {
    "gate-west": { min_x: 34.26, max_x: 38.0, min_y: 154.815, max_y: 157.185 },
    "gate-east": { min_x: 42.0, max_x: 45.74, min_y: 154.815, max_y: 157.185 },
  };
  for (const o of doc.staticObstacles.filter((r) => want[r.id]))
    for (const [k, v] of Object.entries(want[o.id])) assert.ok(near(o[k], v, 0.001), `${o.id}.${k} ${o[k]} vs ${v}`);
  assert.equal(doc.staticObstacles.length, 42);
});

test("every assetPath is a manifest key whose scene file exists; map holds no res:// or studio-cache", () => {
  const withAsset = [...doc.structures, ...doc.props].filter((x) => x.assetPath);
  assert.equal(doc.structures.filter((s) => s.assetPath).length, 16, "2 gates + 14 lanterns");
  assert.equal(doc.props.length, 2);
  for (const x of withAsset) {
    const e = manifest[x.assetPath];
    assert.ok(e, `no manifest entry for ${x.assetPath}`);
    const p = resolve(ROOT, "game-client", e.scene.replace("res://", ""));
    assert.ok(existsSync(p) && statSync(p).size > 0, `missing scene ${e.scene}`);
  }
  const text = JSON.stringify(doc);
  assert.ok(!text.includes("studio-cache") && !text.includes("res://"), "keys only");
});

test("barrel props sit beside the gate: no collision, off the road margin, clear of the tower", () => {
  const barrels = doc.props.filter((p) => p.assetPath === "env:maro-barrel");
  assert.deepEqual(barrels.map((b) => b.id).sort(), ["barrel-gate-01", "barrel-gate-02"]);
  for (const b of barrels) {
    assert.equal(b.blocksMovement, false);
    assert.ok(Math.abs(b.x) >= 3.5, `${b.id} inside road clear margin`);
    const inTower = Math.abs(b.x) < 5.74 + 0.31 && Math.abs(b.x) > 2.0 - 0.31 && b.z > 74.815 - 0.31 && b.z < 77.185 + 0.31;
    assert.ok(!inTower, `${b.id} overlaps the tower`);
  }
});

test("workshop lantern light and label sit on the 3.1 m post (lantern-06)", () => {
  const m = pocSrc.match(/Lantern06WorldPos\s*=\s*new\(\s*(-?[\d.]+)f,\s*(-?[\d.]+)f,\s*(-?[\d.]+)f\s*\)/);
  assert.ok(m, "Lantern06WorldPos not found");
  const l6 = byId.get("lantern-06");
  assert.ok(near(+m[1], l6.x, 0.01) && near(+m[3], l6.z, 0.01) && +m[2] === 0, "x/z match, y 0 (glb floor pivot)");
  const lamp = +pocSrc.match(/WorkshopLanternLampY\s*=\s*([\d.]+)f/)?.[1];
  const label = +pocSrc.match(/WorkshopLanternLabelY\s*=\s*([\d.]+)f/)?.[1];
  assert.ok(lamp >= 2.5 && lamp <= 3.1, `lamp y ${lamp}`);
  assert.ok(label >= 3.3, `label y ${label}`);
  assert.equal((pocSrc.match(/new Vector3\(0f, WorkshopLanternLampY, 0f\)/g) ?? []).length, 2, "light + glow head");
  assert.ok(!/AttachLanternLabel\(WorkshopLanternNode,[^;]*\);/.test(pocSrc.replace(/AttachLanternLabel\(WorkshopLanternNode,[^;]*WorkshopLanternLabelY\);/g, "")), "all workshop labels pass the new height");
});
```

- [ ] **Step 3: Run and confirm red for the right reasons.**
  Run: `node --test scripts/tests/maro-bell.test.mjs`
  Verify-Cmd: `node --test scripts/tests/maro-bell.test.mjs`
  Expected: the 6 new tests FAIL (heights 5 vs 6.5 / 2.5 vs 3.1; gate x -4.5; obstacle min_x 33; `assetPath` count 0 vs 16; barrels `[]`; `Lantern06WorldPos` ok but `WorkshopLanternLampY` missing). All 9 pre-existing tests still pass. A failure from a syntax error or a missing `manifest.json` is the wrong reason: fix the test.
- [ ] **Step 4: Format and commit.** `npx prettier --write scripts/tests/maro-bell.test.mjs && npx eslint --fix scripts/tests/maro-bell.test.mjs`; `git add scripts/tests/maro-bell.test.mjs`; commit `test(maro-bell): F-218 failing checks for canon heights, gate art, assetPath, barrels, lantern light`.

### Task 2: Map JSON re-block (`content/maps/maro-bell.json`)

**Files:**
- Modify: `content/maps/maro-bell.json` (gate rows 93/107, structure rows, `"props": []` at 763, obstacle rows 767/774).

**Interfaces:**
- Consumes: Task 1 tests, the Re-block numbers and Placement sections of the spec (they are the brief; values are not repeated beyond what the script needs).
- Produces: structures with optional `"assetPath"`; 2 props with the existing `UnifiedMapProp` fields (`UnifiedMapDocument.cs:89-100`: `id, assetPath, x, y, z, rotY, scale, blocksMovement, colliderHalfExtent`).

- [ ] **Step 1: Write a one-off script** in the scratchpad dir (not in the repo): `edit_maro_bell.py`.

```python
import json, sys
p = sys.argv[1]
t = open(p).read(); d = json.loads(t)
assert json.dumps(d, indent=1, ensure_ascii=False) + "\n" == t, "format drift: stop"
S = {s["id"]: s for s in d["structures"]}
for g, x in (("gate-west", -3.87), ("gate-east", 3.87)):
    S[g].update(x=x, size={"x": 3.74, "y": 7.1, "z": 2.37}, assetPath="env:maro-gate-tower")
for i in ("amber-shop", "bram-house", "tovin-shrine"):
    S[i]["size"]["y"] = 6.5
for s in d["structures"]:
    if s["id"].startswith("lantern-"):
        s["size"]["y"] = 3.1; s["assetPath"] = "env:maro-lantern-post"
d["props"] = [
    {"id": "barrel-gate-01", "assetPath": "env:maro-barrel", "x": -3.8, "y": 0, "z": 72.5, "rotY": 0, "scale": 1, "blocksMovement": False, "colliderHalfExtent": 0.31},
    {"id": "barrel-gate-02", "assetPath": "env:maro-barrel", "x": 3.8, "y": 0, "z": 72.8, "rotY": 0, "scale": 1, "blocksMovement": False, "colliderHalfExtent": 0.31},
]
O = {o["id"]: o for o in d["staticObstacles"]}
O["gate-west"].update(min_x=34.26, max_x=38.0, min_y=154.815, max_y=157.185)
O["gate-east"].update(min_x=42.0, max_x=45.74, min_y=154.815, max_y=157.185)
open(p, "w").write(json.dumps(d, indent=1, ensure_ascii=False) + "\n")
```
  Check the `structures` key order puts `assetPath` last in each row (harmless). Barrel positions: `|x| = 3.8 >= 3.5` (road 4.0 + margin 1.0) and `z < 74.815` clear of the tower (spec Barrel bullet).
- [ ] **Step 2: Run it:** `python3 "$SCRATCH/edit_maro_bell.py" content/maps/maro-bell.json`. Expected: no assertion error.
- [ ] **Step 3: AC4 proof, other 40 rows byte-identical.**

```python
import json, subprocess
a = json.loads(subprocess.check_output(["git","show","HEAD:content/maps/maro-bell.json"]))["staticObstacles"]
b = json.load(open("content/maps/maro-bell.json"))["staticObstacles"]
ch = [x["id"] for x, y in zip(a, b) if x != y]
assert ch == ["gate-west", "gate-east"] and len(a) == len(b) == 42, ch
print("OK only", ch)
```
  Expected: `OK only ['gate-west', 'gate-east']`. Also `git diff --stat content/maps/maro-bell.json` shows only that file.
- [ ] **Step 4: Run the map tests.** `node --test scripts/tests/maro-bell.test.mjs`.
  Expected: PASS for canon heights, gate towers, obstacle rows, barrels, plus all 5 old ones (parity: obstacle count 42; road and spawn tests pass by arithmetic, spec "Collision"). STILL FAIL: the manifest test (no entries/files yet) and the lantern light test (Task 3). Say so in the commit body.
- [ ] **Step 5: Poc tests.** `node --test scripts/tests/poc-maro-*.test.mjs scripts/tests/canon-names.test.mjs`. Expected: all pass (no gate-size pin found by the spec's grep).
- [ ] **Step 6: Commit** `feat(maro-bell): F-218 canon re-block, gate towers resized to the art, lantern assetPath, barrel props`.

---

## Phase B: client code and Godot verify

### Task 3: C# client changes

**Files:**
- Modify: `game-client/src/World/UnifiedMapDocument.cs:126-142` (add field after `Solid`, line 141).
- Modify: `game-client/src/World/MapChunkStreamer.cs:818` (`SpawnGreyBlock`), `:1088-1109` (`SpawnSinglePropIntoChunk`), caller at `:472`.
- Modify: `game-client/src/World/MaroBellPocController.cs:28`, `:274`, `:382-396`, `:670-697`.
- Read only: `game-client/src/Content/AssetRegistry.cs:70` (`Resolve(string typeId, out ResolveTier tier)`, never null, returns a capsule with `ResolveTier.Capsule` on a miss).

**Interfaces:**
- Produces `UnifiedMapStructureVolume.AssetPath` (`string?`, default null, JSON `assetPath`).
- Produces in `MapChunkStreamer`: `private PackedScene? ResolveAssetScene(string assetPath)` (null for empty, a `Capsule` tier, or an unloadable key; cached in `_sceneCache`, line 36). `SpawnGreyBlock` becomes an instance method (drop `static`).
- Produces `Glb_<id>` child under `Structure_<id>` (node name pinned for Task 4).
- Produces constants `WorkshopLanternLampY`, `WorkshopLanternLabelY` (names pinned in Task 1).

- [ ] **Step 1: Field.** After `UnifiedMapDocument.cs:141` add
  `[JsonPropertyName("assetPath")] public string? AssetPath { get; set; }` with a one-line summary comment (manifest key or `res://` path; null draws the grey box).
- [ ] **Step 2: Resolver and block branch in `MapChunkStreamer.cs`.** First add `using AtlasWorld.Client.Content;` (the file imports only System, System.Collections.Generic, Godot, `MapChunkStreamer.cs:1-3`, namespace `AtlasWorld.Client.World`; `AssetRegistry`/`ResolveTier` live in `AtlasWorld.Client.Content`, `ResolveTier.cs:1`), or `dotnet build` fails.

```csharp
private PackedScene? ResolveAssetScene(string assetPath)
{
    if (string.IsNullOrEmpty(assetPath)) return null;
    if (_sceneCache.TryGetValue(assetPath, out PackedScene? cached)) return cached;
    PackedScene? scene = null;
    if (assetPath.StartsWith("res://"))
        scene = ResourceLoader.Exists(assetPath) ? GD.Load<PackedScene>(assetPath) : null;
    else if (AssetRegistry.Instance is { } reg)
    {
        PackedScene s = reg.Resolve(assetPath, out ResolveTier tier);
        scene = tier == ResolveTier.Capsule ? null : s; // a miss must keep the grey box, never a capsule
    }
    _sceneCache[assetPath] = scene;
    return scene;
}
```
  In `SpawnGreyBlock` (now `private void`), before the BoxMesh, branch:

```csharp
Node3D? glb = ResolveAssetScene(s.AssetPath ?? "")?.Instantiate() as Node3D;
if (glb != null)
{
    glb.Name = $"Glb_{s.Id}";
    glb.Position = new Vector3(0f, s.Hover, 0f);
    glb.Rotation = new Vector3(0f, s.RotY, 0f);
    EntityView.ApplyAnimeToonShading(glb, EntityKind.Npc);
    root.AddChild(glb);
    _occluder?.RegisterPropRoot(glb, Mathf.Max(s.Size.X, s.Size.Z) / 2f, 1f); // without this the 7.1 m tower blocks the camera with no fade
}
else
    root.AddChild(new MeshInstance3D { /* existing Block_<id> BoxMesh, unchanged */ });
```
  The `Label3D` block below stays as is (label at `top + 0.35`). A null `Instantiate()` result or unresolved key falls to the BoxMesh. `SpawnSinglePropIntoChunk`: replace the inline `_sceneCache` lookup (lines 1090-1096) with `PackedScene? scene = ResolveAssetScene(prop.AssetPath);` so `env:maro-barrel` resolves. Keep the rest (toon shading, occluder) unchanged.
- [ ] **Step 3: Lantern light.** In `MaroBellPocController.cs` next to line 28 add `public const float WorkshopLanternLampY = 2.8f; public const float WorkshopLanternLabelY = 3.4f;`. First read the lamp cage height from the lane glb (read only): `node -e` over the GLB JSON chunk of `env/pilot/r04/r04.glb` printing node names and mesh POSITION accessor `max[1]`. If a separate lamp/cage mesh exists use its centre y for `WorkshopLanternLampY`; if not, keep 2.8 (inside the spec's 2.5-3.1 band) and say so in the commit body. Then replace `Position = new Vector3(0f, 2.2f, 0f)` at 672 and 692 with `new Vector3(0f, WorkshopLanternLampY, 0f)`. Change `AttachLanternLabel(Node3D root, string labelText)` (382) to `(Node3D root, string labelText, float labelY = 2.65f)` and use `new Vector3(0f, labelY, 0f)` at 396 (the existing-label branch also sets `existing.Position = new Vector3(0f, labelY, 0f)`). Pass `WorkshopLanternLabelY` only at the two workshop calls (274, 697). The old-lantern and time-wound labels (283, 318, 876, 951, 997) stay on the default.
- [ ] **Step 4: Build and run JS tests.** `dotnet build game-client/GameClient.csproj --nologo -v q`. Expected: 0 errors. `node --test scripts/tests/maro-bell.test.mjs`. Expected: lantern light test now PASSES; only the manifest test still fails.
- [ ] **Step 5: Commit** `feat(client): F-218 assetPath on map blocks, shared key resolver, workshop lantern light on the 3.1 m post`.

### Task 4: `MaroBellVerify.cs` changes (red until Task 5)

**Files:**
- Modify: `game-client/src/World/MaroBellVerify.cs:73` (BoxMesh rule), add block-top assert after the solid-count report (~line 81).
- Read first: the whole file for other `Block_` lookups (only line 73 was found) and pinned block heights; `TerrainElevation.cs:149, 380` (`SampleBaseTerrainHeight(wx, wz, doc)`, `SampleHeight(wx, wz, doc, currentEntityY)`), read only.

**Interfaces:** Consumes `Glb_<id>` and `AssetPath` from Task 3.

- [ ] **Step 1: Replace line 73** with the two-part rule:

```csharp
Report("every block without assetPath has a BoxMesh",
    spawned.Where(t => string.IsNullOrEmpty(t.s.AssetPath))
           .All(t => t.node?.GetNodeOrNull<MeshInstance3D>($"Block_{t.s.Id}")?.Mesh is BoxMesh));
var glbBlocks = spawned.Where(t => !string.IsNullOrEmpty(t.s.AssetPath)).ToList();
Report($"all {glbBlocks.Count} assetPath blocks (2 gates + 14 lanterns) have Glb_<id> and no Block_<id> BoxMesh",
    glbBlocks.Count == 16 && glbBlocks.All(t => t.node?.GetNodeOrNull<Node3D>($"Glb_{t.s.Id}") != null
        && t.node?.GetNodeOrNull($"Block_{t.s.Id}") == null));
```
- [ ] **Step 2: Block-top assert** (stand-on-tower impossible):

```csharp
Report("no assetPath block top is walkable (SampleHeight == base terrain)",
    glbBlocks.All(t => Mathf.Abs(
        TerrainElevation.SampleHeight(t.s.X, t.s.Z, doc, t.s.Hover + t.s.Size.Y + 0.1f)
        - TerrainElevation.SampleBaseTerrainHeight(t.s.X, t.s.Z, doc)) <= 0.01f));
```
  Also assert the barrel props resolved: after streaming, `root.FindChild("barrel-gate-01", true, false) != null` and `...-02`.
- [ ] **Step 3: Run it (red).** `scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL '^\[MaroBellVerify\] VERDICT PASS$'` (one Godot at a time; first run imports ~633 glbs, bounded by `ATLAS_GODOT_IMPORT_TIMEOUT`).
  Expected: FAIL on the `Glb_<id>` row and the barrel row ONLY (manifest entries do not exist yet, so the keys miss and the blocks fall back to the grey box: this is the right reason). Any other failing row: stop and read it.
- [ ] **Step 4: Commit** `test(godot): F-218 MaroBellVerify rule for assetPath blocks and block-top assert`.

### Phase gate A+B (Tasks 1-4, R1: public map + client)
- [ ] Verify: `node --test scripts/tests/maro-bell.test.mjs` (only the manifest test red, known), `dotnet build` 0 errors.
- [ ] Review: ONE `code-reviewer` plus a C# reviewer on Tasks 2-4 diff; one fix round; one scoped re-review. Check: `static` drop affects no other caller (spec Risks: caller 472 is in an instance method), BoxMesh fallback intact, no edit to files owned by F-198/F-199.
- [ ] `/simplify`, then re-verify the two commands above.

---

## Phase C: assets, manifest, thumbs, Godot green

### Task 5: Copy the glbs, lane gate, import, manifest, thumbs, ledger (licence = placeholder)

**Files:**
- Create (LFS): `game-client/assets/env/maro_gate_tower.glb`, `maro_lantern_post.glb`, `maro_barrel.glb`.
- Create (generated, tracked): `game-client/assets/env/<name>.glb.import` x3, the extracted `<name>_*.jpg` and `.jpg.import` (names read from the run; model: `env/barrel.glb.import:44`, `crate_Atlas.png.import`).
- Modify: `game-client/assets/manifest.json` (3 entries under `entries`), `game-client/assets/.thumbs/index.json` + 3 new `.thumbs/<thumbFilename>.webp`, `art-source/LICENSES.md` (3 rows; table header at line 8, model row `env/barrel.glb` line 120).

**Interfaces:** Consumes manifest key names from Task 1. Produces the 3 manifest entries (licence value placeholder `"O1-PENDING"`, which the gate rejects on purpose until Task 9).

- [ ] **Step 1: AC1, lane gate GREEN (read-only run, outputs to the scratchpad dir, not the lane).**
  `cd /Users/pasitnusso/asset-studio-private/atlas-3d-plan && python3 tools/env_gate.py env/pilot/r01/r01-4k.glb --recipe recipes/env/maro-arrival/r01-valley-gate-tower.json --variant gate-tower-4k --out "$SCRATCH/gate-r01.json"`; `env/pilot/r04/r04.glb --recipe recipes/env/maro-arrival/r04-lantern-post.json --variant lantern-post --out "$SCRATCH/gate-r04.json"`; `env/pilot/r15/r15.glb --recipe recipes/env/maro-arrival/r15-street-props.json --variant barrel --out "$SCRATCH/gate-r15.json"`. The recipe and variant come from each `*.env.json` sidecar (the sidecar itself is NOT a recipe: `env_gate.py:338` reads `recipe["variants"]`; r15 has several variants so `--variant` is required, `:339`). Args: `env_gate.py:329-333`; exit 0 = no RED (r01 verified: RESULT GREEN).
  Expected: three exit codes 0; keep the 3 JSONs for the PR text.
- [ ] **Step 2: Copy and hash.** `cp` the 3 lane glbs to the 3 new names under `game-client/assets/env/`. `sha256sum` each target against its lane source. Expected: 3 identical pairs; record them (PR text).
- [ ] **Step 3: LFS check (AC0).** `git add game-client/assets/env/maro_*.glb && git lfs ls-files | grep maro_ && git check-attr filter game-client/assets/env/maro_gate_tower.glb`.
  Expected: 3 lines in `lfs ls-files`; `filter: lfs`.
- [ ] **Step 4: Import.** `"$GODOT" --headless --path game-client --import` (bounded as in `godot-verify.sh`). Expected: no import error naming a `maro_` glb. `git status --short game-client/assets/env` lists the 3 `.glb.import` and the extracted jpg(s) (+ `.jpg.import`). `git ls-files game-client/studio-cache | wc -l` unchanged from Task 0.
- [ ] **Step 5: Manifest entries** (shape copied from `env:barrel` in `catalog-manifest.json:522-529`, no `pull` block, no `anims`; spec "Entry shape"):

```json
"env:maro-gate-tower": { "scene": "res://assets/env/maro_gate_tower.glb", "render": "model3d", "kind": "environment", "source": "owner-generated (Tripo), E2 pilot r01", "license": "O1-PENDING", "tier": "bespoke" },
"env:maro-lantern-post": { "scene": "res://assets/env/maro_lantern_post.glb", "render": "model3d", "kind": "environment", "source": "owner-generated (Tripo), E2 pilot r04", "license": "O1-PENDING", "tier": "bespoke" },
"env:maro-barrel": { "scene": "res://assets/env/maro_barrel.glb", "render": "model3d", "kind": "prop", "source": "owner-generated (Tripo), E2 pilot r15", "license": "O1-PENDING", "tier": "bespoke" }
```
  (`source` text carries no absolute or private path; check the real `manifest.json` key order/format and keep its indentation.)
- [ ] **Step 6: Thumbnails through the Blender lock.** Dry run first: `node scripts/bake_thumbnails.mjs --only env/maro_ --dry-run`. Expected: lists exactly the 3 glbs. Then
  `python3 /Users/pasitnusso/asset-studio-private/atlas-3d-plan/lib/factory/blender_lock.py f218-thumbs -- node scripts/bake_thumbnails.mjs --only env/maro_`.
  Expected: 3 new `.thumbs/*.webp` and 3 new `index.json` rows with `srcHash`; rows outside the filter carried forward unchanged (`bake_thumbnails.mjs:31-35, 211`). `git diff --stat game-client/assets/.thumbs/index.json` shows additions only.
- [ ] **Step 7: Ledger rows** in `art-source/LICENSES.md` after the model row at line 120: `| env/maro_gate_tower.glb | owner-generated | Tripo E2 pilot r01 | O1-PENDING | owner | 2026-11-15 | bespoke tier, env:maro-gate-tower, public by owner pick 1 |` and the same for lantern post and barrel. All 3 rows get the final value in Task 9.
- [ ] **Step 8: Verify.** Also run `node --test atelier/atlas-world-panels/tests/*.test.mjs` (Gate 1 runs it for `content/` and `game-client/assets/` changes, `precheck.sh:493,506`); expected pass.
  - `node --test scripts/tests/maro-bell.test.mjs` -> all PASS (manifest test now green).
  - `node scripts/check_asset_manifest.mjs` -> EXPECTED failures are only the 3 `license "O1-PENDING" not allowed` lines (`license-policy.mjs:12, 41-45`); thumbs fresh (rule U), no other new FAILURE, exactly 3 new UNKNOWN warnings for the `env:maro-*` keys (rule G), no codegen drift.
  - `scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL '^\[MaroBellVerify\] VERDICT PASS$'` -> PASS with the Task 4 rows green (AC5), no import errors for the 3 glbs. Then `scripts/godot-verify.sh ATLAS_VERIFY_POC_MARO_10M '^\[PocMaro10mVerify\] VERDICT PASS$'` and `scripts/godot-verify.sh ATLAS_VERIFY_PLAYTEST_SANDBOX '^\[PlaytestSandboxVerify\] VERDICT PASS$'` (confirm the exact PASS regex in `PocMaro10mVerify.cs` header, line 17, before running; run sequentially).
- [ ] **Step 9: Commit (local only, no push)** in two commits: `feat(assets): F-218 3 pilot env glbs (LFS) with import sidecars` and `feat(manifest): F-218 env:maro-* entries, thumbs, ledger rows (licence pending O1)`.

---

## Phase D: Game DB shots, screenshots

### Task 6: Game DB shots from `MaroBellVerify.Render` (spec scope 4)

**Files:**
- Create: `content/concept-art/images/maro-bell-env-pilot-eye-gate.webp`, `maro-bell-env-pilot-top-down.webp` and `content/concept-art/thumbs/` twins.
- Modify: `content/concept-art/index.json` (2 items, same shape as `maro-bell-grey-box-top-down` / `-eye-gate`).
- Guard: `scripts/tests/concept-art-thumbs.test.mjs` (thumb must be a downscale of its image).

- [ ] **Step 1: Check the F-216 state.** `git fetch` then `git log origin/release/1.34 --oneline | grep -i F-216`. If F-216 shipped, rebase and add the 2 entries in its format; if not, use today's `content/concept-art/index.json` (spec "Ship order"). Never edit explorer code.
- [ ] **Step 2: Render (windowed, not headless; header comment `MaroBellVerify.cs:16-17`).** `ATLAS_VERIFY_MARO_BELL=1 ATLAS_RENDER_MARO_BELL="$SCRATCH/shots" "$GODOT" --path game-client`. Expected: `maro-bell-top-down.png` and `maro-bell-eye-gate.png`, 1280x720, in `$SCRATCH/shots`; the run quits by itself (read the log for `VERDICT PASS`).
- [ ] **Step 3: Read both PNGs** (`Read` tool, one image each). Expected per shot: top-down (`MaroBellVerify.cs:431-435`, ortho Size 175, y 250, about 4 px/m): 2 tower footprints and 14 posts at the gate, no grey box at the gates; a 0.62 m barrel is only 2-3 px, do not look for it. Eye-gate (`MaroBellVerify.cs:438-443`: camera at (0,1.0,71) looking at (0,7,-66), i.e. north, AWAY from the gates at z 76 and barrels at z 72.5-72.8): lantern posts along the road, no towers or barrels in frame. Towers, doors and barrels are proven by the Task 4/5 `Glb_`/barrel verify rows and the Task 7 captures. Do not change the camera (out of spec scope). Do not chase missing towers or barrels in these two shots.
- [ ] **Step 4: Convert** to webp (<= 800 KB, <= 2800 px) and make the thumbs with `sharp` (already a devDependency used by `concept-art-thumbs.test.mjs:11`): `node -e` script in the scratchpad dir that resizes to the existing thumb width of the grey-box entries (read one of those first and match its dimensions).
- [ ] **Step 5: Index items.** `id` `maro-bell-env-pilot-eye-gate` / `maro-bell-env-pilot-top-down`, `category: "town"`, `loreRef: "maro-bell"`, `tool: "godot-grey-box"` (the existing value; `atelier/atlas-world-panels/js/concept-arts-model.mjs:52-58` SCHEMA_TOOLS, rejected otherwise at `:298-300`; never add a value, that is F-216 explorer code), `rights: "concept-reference"`, `verdict: "unreviewed"`, caption ends with **"B1: player unchanged (~1 m), big town is intended"**, prompt text "Godot render of content/maps/maro-bell.json with the 3 pilot env glbs" (no private path). Keep the file's formatting (inspect the line style first).
- [ ] **Step 6: Verify.** `node --test scripts/tests/concept-art-thumbs.test.mjs scripts/tests/catalog-canon.test.mjs` and `node --test atelier/atlas-world-panels/tests/concept-arts.test.mjs` (checks the real index, `concept-arts.test.mjs:257`; Gate 1 runs it for `content/` changes, `precheck.sh:493,506`) PASS; any other test that lists `content/concept-art` (grep `concept-art` in `scripts/tests`, found: `atlas-web-verify.test.mjs`) PASS.
- [ ] **Step 7: Commit** `feat(game-db): F-218 two env-pilot shots for Maro Bell`.

### Task 7: Phone + desktop screenshots in a local Godot run (AC7)

**Files:** none in the repo (images go to the scratchpad dir; they are shown to the owner).

- [ ] **Step 1: Capture (from the repo root, spec AC7 commands).** Phone then desktop, one Godot at a time:

```sh
GODOT=~/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot
ATLAS_MAP_ID=maro-bell ATLAS_CAPTURE_SCREENSHOT=1 ATLAS_SCREENSHOT_DELAY=5 ATLAS_QUIT_AFTER_SCREENSHOT=1 \
  "$GODOT" --path game-client --resolution 390x844 && cp /tmp/atlas_actual_render.png "$SCRATCH/after-phone.png"
# repeat with --resolution 1280x800 -> after-desktop.png
```
  Capture hook: `VerticalSliceRoot.cs:571-585` (read only). Not checked in the spec: whether it needs the local server room up and whether the arrival camera frames the gate. If it fails or frames the wrong place, frame by hand through `run_playtest.sh` and write that in the report; do NOT edit `VerticalSliceRoot.cs` (F-198/F-199).
- [ ] **Step 2: Before shots.** Run the same two captures on the base commit (`git stash` is not needed: `git worktree add "$SCRATCH/base" origin/release/1.34`, import there takes up to 900 s (`ATLAS_GODOT_IMPORT_TIMEOUT`); remove it afterwards with `git worktree remove --force "$SCRATCH/base"`; if too slow, use the grey-box Game DB entries as the "before" and state it).
- [ ] **Step 3: Look.** `Read` each image (hook downscales to 1024 px). Check: both towers with doors toward the town, 14 lanterns, 2 barrels, no grey box behind an art piece, outline shader not breaking on env glbs (F-198 watch item), B1 flag in the caption. UI skill note: `ui-visual-verify` `shoot.mjs` only captures web pages, so it is NOT used here (spec AC7). Show the final images to the owner via `~/.local/bin/img-preview-link -m <img>` if remote.
- [ ] **Step 4: No commit** (no repo change). Attach image paths in the PR text.

---

## Phase E: docs, Gate 1 dry-run

### Task 8: README, docs, Gate 1 (except the licence row)

**Files:**
- Modify: `README.md:225` (the "Pull-only assets (F-174)" paragraph says owner-generated glbs are "never committed": add one sentence that F-218 commits 3 owner-generated env glbs as LFS files by the owner's explicit pick, licence per Task 9) and a short "Map blocks with `assetPath`" paragraph near the Playtest Sandbox section (`README.md:235-247`, which already lists the `godot-verify.sh` commands) describing `assetPath` (manifest key or `res://`), the `Glb_<id>` node name, the BoxMesh fallback, and that `props` entries with `blocksMovement: false` add no obstacle.
- Also update `docs/asset-intake.md`: it documents the manifest (`:6-7` prefer CC0 + LICENSES row; `:23-27` manifest.json entry shape). Add one line that F-218 env glbs are committed owner-generated LFS entries (licence wording per Task 9). Otherwise no other doc documents the map format or asset manifest: `grep -n 'assetPath\|manifest.json' README.md docs/*.md` found none besides the README paragraph at 225 and `docs/asset-intake.md` (re-run the grep, cite what it finds).
- No architecture diagram change: no service or data flow changes (state this; `drawio` task not needed).

- [ ] **Step 1: Edit the README** (two small edits above). Format: `npx prettier --check README.md` only if the repo already formats it (`git log -1 -- README.md` style); otherwise skip.
- [ ] **Step 2: Gate 1 dry run.** `scripts/precheck.sh --no-install` (`precheck.sh:34-35`). Expected: green except the single known `check_asset_manifest` licence failure. If the script stops at the first failure, run its remaining steps one by one (`scripts/godot-verify.sh` x4 as in `precheck.sh:549-552`, `node --test scripts/tests`, `cargo test` in `server-rs`) so each result is seen. Gate 1 runs the studio pull (`precheck.sh:519-524, 543`): Asset Studio must be up.
- [ ] **Step 3: Server tests (AC6).** `cd server-rs && cargo test`. Expected: green, including `loads_maro_bell_grey_box_map_with_authored_spawn` (`map.rs:758-767`).
- [ ] **Step 4: Commit** `docs: F-218 README for assetPath blocks and the committed env glbs`.

### Phase gate C-E (R1: public assets)
- [ ] Verify: every command in Tasks 5-8 re-run once; outputs match the expected lines. Also run `node --test atelier/atlas-world-panels/tests/*.test.mjs` (Gate 1 runs it for `content/` and `game-client/assets/` changes, `precheck.sh:493,506`); expected pass.
- [ ] Review: ONE consolidated reviewer on the Phase C-E diff (LFS pointers not leaked as text, `source` text has no private path, `staticObstacles` only 2 rows, sha256 pairs, no file under `game-client/studio-cache/`). One fix round, one scoped re-review. `/simplify`. Re-verify.

---

## Phase F: licence (LAST), then ship (BLOCKED until the owner picks)

### Task 9: Licence value (spec O1; BLOCKED until the owner answers card "5 · Licence" on https://claude.ai/artifact/1i4SoVVpbr3kDf2fRi58TY)

**Files:**
- Modify: `game-client/assets/manifest.json` (3 `license` fields), `art-source/LICENSES.md` (3 rows), and per option `scripts/lib/license-policy.mjs` (+ its test under `scripts/tests/`, find it with `grep -ln license-policy scripts/tests/*.mjs`).

**Interfaces:** Parameter `LICENCE_OPTION` in {own, cc0, studio}. Never guess the pick; if it is not in the owner's answer, stop and report.

- [ ] **Step 1 (own = new allowed value "public, rights kept").** Add `"public, rights kept"` to `ALLOWED` (`license-policy.mjs:12`) with a comment update at `:27-28` (an owner-generated asset may now be committed under this value; a pull-only entry must still be `studio-private`). Write the failing test FIRST in the existing license-policy test file: entry with `license: "public, rights kept"` and no `pull` block passes; the same value with a `pull` block fails (`license-policy.mjs:27-31` rule stays). See it fail, implement, see it pass. Set the 3 manifest `license` fields and 3 ledger rows to `public, rights kept`.
- [ ] **Step 1 (cc0).** Set the 3 manifest fields and 3 ledger rows to `CC0`; update only the comment at `license-policy.mjs:27-28` (it overrides the F-174 wording). No `ALLOWED` change (`CC0` is already there, `:12`). Note the gate cannot catch a wrong pick (`license-policy.mjs:30-45`).
- [ ] **Step 1 (studio).** Return to the Asset Studio pull: this REPLACES the LFS copy. Remove the 3 glbs, their sidecars and thumbs from git; entries become pull entries with a `pull` block and `license: "studio-private"` per `license-policy.mjs:27-37` and `README.md:225-232` (`scripts/studio-pull.mjs`), `scene` `res://studio-cache/<sha256>.glb`; re-bake thumbs through the Blender lock; re-run the Task 5-8 verifications. This is a larger rework: re-plan it with the owner before starting.
- [ ] **Step 2: Verify.** `node scripts/check_asset_manifest.mjs` -> no FAILURE, 3 UNKNOWN warnings only (AC2). `node --test scripts/tests` (license-policy test included). `git diff` shows the 3 entries, 3 rows, and (own/cc0) the policy lines.
- [ ] **Step 3: Commit** `feat(licence): F-218 licence value for the 3 owner-generated env glbs (owner pick O1)`.

### Task 10: Gate 1, ship, local deploy (BLOCKED until Task 9 is committed; push/ship forbidden before)

- [ ] **Step 1: Full Gate 1.** `scripts/precheck.sh --no-install`. Expected: green (AC8). Record the `sha256sum` of the 3 glbs next to the lane originals for the PR text (spec: no sha256 check exists for committed entries; integrity is the LFS oid).
- [ ] **Step 2: Ship.** From inside the feature worktree: `psrw ship` (Gate 1, merge into `release/1.34`, catalog shipped). Rebase notes: `_catalog.json` and `.release.json` conflict as usual. If F-199 landed first, re-run `scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL ...` after the rebase (block-top assert).
- [ ] **Step 3: LFS objects reach the remote.** `git lfs ls-files`. Do NOT run `git lfs push --all origin` (it pushes LFS objects of every local ref to the public remote); if a manual push is needed use `git lfs push origin release/1.34`, otherwise leave it to the pre-push hook at promote (`ship_current_work_to_release.py` runs no `git push`). CI uses `lfs: true`, `ci.yml:23`.
- [ ] **Step 4: Local deploy FROM the `_release` worktree on release/1.34** (`deploy-local.sh:81-87`: the web image rebuilds only on the release branch). `cd .../worktrees/_release && git rev-parse --abbrev-ref HEAD` (expected `release/1.34`) then `scripts/deploy-local.sh`. Requires the 3 LFS objects present locally (`Dockerfile.atlas-web:11` runs `scripts/check_atlas_web_image.py`, which fails any file under 200 B, `check_atlas_web_image.py:68-71`). The k8s context check applies (use the `k8s-safety` skill first; this is the LOCAL cluster).
- [ ] **Step 5: Live check on the user's surface (Tier 4).** `kubectl rollout status` for the server and web deployments in namespace `atlas-world` (`deploy-local.sh:75`); `curl` the web `/api/runtime` and confirm it reports `git rev-parse HEAD` of release/1.34; open the concept-art view (in the form F-216 left it) and confirm the 2 new entries render (screenshot, `Read` it). The glbs themselves show in the local Godot run (spec pick 3), not in a served web build: say that to the owner.
- [ ] **Step 6: Report** to the owner with the phone + desktop images and the B1 flag. File off-goal findings as one line each in `docs/superpowers/ideas.md`.

---

## AC to task map

| AC | Proven by |
|---|---|
| 0 glbs LFS, sha256, sidecars, no studio-cache | Task 5 steps 2-4 |
| 1 lane `env_gate.py` GREEN x3 | Task 5 step 1 |
| 2 `check_asset_manifest.mjs` no FAILURE | Task 5 step 8 (only licence red), Task 9 step 2 (green) |
| 3 maro-bell, poc-maro, canon-names tests | Tasks 1, 2, 3, 5 |
| 4 only 2 obstacle rows change | Task 2 step 3 + Task 1 obstacle test |
| 5 Godot verifies (MaroBell, PocMaro10m, PlaytestSandbox) | Tasks 4 (red), 5 step 8 (green), 8 step 2 |
| 6 `cargo test` + JS parity (42 obstacles) | Task 8 step 3, Task 1 |
| 7 Game DB shots + phone/desktop captures | Tasks 6, 7 |
| 8 Gate 1 green, `psrw ship` | Task 8 step 2 (dry), Task 10 steps 1-2 |
| 9 deploy from `_release`, `/api/runtime`, shots render | Task 10 steps 4-5 |

Scope item to task: 0 -> 5; 1 -> 5; 2 -> 3; 3 -> 2; 4 -> 6; 5 -> 10. Open point O1 -> Task 9.

## Audit trail

- Written against the live code at release/1.34 (`_release` worktree). Deviations from the spec order: Task 4 runs Godot red before Task 5 (the `Glb_` rows need the glbs); full Gate 1 can only be green after Task 9 (the licence gate rejects the placeholder on purpose), so Task 8 is a dry run and Task 10 is the real gate.
