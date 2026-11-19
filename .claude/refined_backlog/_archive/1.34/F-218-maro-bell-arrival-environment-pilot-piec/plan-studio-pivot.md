# F-218 studio pivot: the 3 env pilot glbs back to the Asset Studio pull (spec rev 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (owner, verbatim):** "Can we have work on doing Game Environment in parallel ?" -> first slice "Maro Bell arrival" = F-218. Owner pick 2026-11-15, decision page card
"5 · Licence" = "studio" ("Back to Asset Studio pull": "The models stay private, as the repo rule says today. This changes your Models pick."; chat: "Private").

**Architecture:** Same map + client work as `plan.md` Tasks 1-4 (kept as built, commits `83d0264dd`, `f60286edd`, `0dc67898a`, `7c218a8a5`). The 3 glbs leave the repo:
the branch is rebuilt without the rev 3 asset commits, the glbs are uploaded to Asset Studio, and they come back as F-174 pull-only manifest entries
(`res://studio-cache/<sha256>.glb`, licence `studio-private`), fetched by `scripts/studio-pull.mjs` into the gitignored cache.

**Supersedes:** the LFS parts of `plan.md` Tasks 5-10 (Task 5 steps 2-9, Task 6 steps 5-7, Task 8 step 1's LFS sentence, Task 9 entirely, Task 10 steps 1, 3, 4, 5 as
listed in P7). **Spec:** `docs/superpowers/specs/2026-11-15-i303-maro-bell-arrival-env-design.md` rev 4.

## Global Constraints

- All of `plan.md` "Global Constraints" still hold (one worktree, one Godot, one Blender, lane READ-ONLY, new commits only, `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`
  trailer, no edits to `VerticalSliceRoot.cs`, `PlaytestSandboxRoot.cs`, `TerrainElevation.cs`, toon/outline shaders, Game DB explorer code).
- `WT=/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-218-maro-bell-arrival-environment-pilot-piec`, `LANE=/Users/pasitnusso/asset-studio-private/atlas-3d-plan`,
  `SCRATCH` = the session scratchpad dir. `GODOT` as in `plan.md:24`.
- **No `git push`, no `psrw ship`, no `gh pr` until P7.** Never `git push` a `refs/backup/*` ref; never `git lfs push --all` (it uploads LFS objects of every local ref).
- Nothing of the 3 props may be committed: no glb, no LFS pointer, no `.import`, no extracted texture, no thumb, no render (guard (W), `scripts/lib/pull-entry.mjs:67-148`).
- Lane sha256 (checked 2026-11-15, `shasum -a 256`): gate tower `env/pilot/r01/r01-4k.glb` `a43acd87e79cf5bf86f2c6c1396c46b08b275051a687fda60f8e7e8de8ebb0e9` (300176 B);
  lantern post `env/pilot/r04/r04.glb` `999cfa4fb48a8a84aec1525ffe6a45ad4251fd3b775f679e5428b21c31ae32e1` (68432 B); barrel `env/pilot/r15/r15.glb`
  `265ec3f7ec1df5b286411c93710e5dcf5ecbffdffa8a77f2c78323df01194323` (75608 B).

---

## P0: Rebuild the branch history without the glbs (orchestrator D1)

State at plan time (`git log --first-parent`): `97ca37d59` (merge release/1.34 = `a590b91fc`) <- `186eec720` docs <- `d8bb210ee` 2 Game DB renders <- `7ef933085` manifest +
thumbs + ledger <- `8a7f95360` 3 LFS glbs + 9 sidecars <- `7c218a8a5` (Task 4) ... `3bf3bacc5` (release sync). The spec-rev-4 commit (`DOCS`, this plan) sits on top.
`git ls-remote --heads origin feat/F-218` was empty; `refs/backup/` was empty.

- [ ] **Step 1: Preconditions.**
  `cd "$WT" && git status --short && git ls-remote --heads origin feat/F-218 && git for-each-ref refs/backup && git branch -r --contains 8a7f95360`
  Expected: all four print nothing (clean tree, never pushed, no backup yet, no remote branch holds the LFS commit). Any output: STOP and report.
- [ ] **Step 2: Backup ref (local only).** `DOCS=$(git rev-parse HEAD) && git update-ref refs/backup/F-218-lfs-tip "$DOCS" && git for-each-ref refs/backup`
  Expected: one line `<DOCS> commit refs/backup/F-218-lfs-tip`. Record `DOCS` in the ledger.
- [ ] **Step 3: Cut back to Task 4 and re-sync.** `git reset --hard 7c218a8a5 && psrw sync` (merges `release/1.34` into the feature worktree). Expected: merge commit,
  no conflict (the dropped commits were the only F-218 files that the old sync merged over). On a conflict: resolve to the release side for every non-F-218 path, F-218 side
  for `content/maps/maro-bell.json`, `game-client/src/World/{MapChunkStreamer,UnifiedMapDocument,MaroBellPocController,MaroBellVerify}.cs`, `scripts/tests/maro-bell.test.mjs`.
- [ ] **Step 4: Put the rev 4 docs back.** `git cherry-pick "$DOCS"`. Expected: clean pick (spec + `plan.md` + this file).
- [ ] **Step 5: Proof that nothing reachable carries the props.**

```sh
git log feat/F-218 --oneline -- 'game-client/assets/env/maro_*' game-client/assets/.thumbs/6a3c07ddafb1aba4.webp \
  game-client/assets/.thumbs/2dd214c0a6e6622b.webp game-client/assets/.thumbs/1a593f1ccb6ceb64.webp \
  'content/concept-art/images/maro-bell-env-pilot-*' 'content/concept-art/thumbs/maro-bell-env-pilot-*'      # expected: empty
git rev-list --objects feat/F-218 | grep -E 'maro_(gate_tower|lantern_post|barrel)|maro-bell-env-pilot'      # expected: empty
for o in a43acd87e79cf5bf86f2c6c1396c46b08b275051a687fda60f8e7e8de8ebb0e9 999cfa4fb48a8a84aec1525ffe6a45ad4251fd3b775f679e5428b21c31ae32e1 \
         265ec3f7ec1df5b286411c93710e5dcf5ecbffdffa8a77f2c78323df01194323; do
  git log feat/F-218 --oneline -S"oid sha256:$o"; done                                                     # expected: empty (no LFS pointer ever added)
git for-each-ref --contains 8a7f95360                                                                     # expected: only refs/backup/F-218-lfs-tip
git ls-remote origin | grep -c -E "$(git rev-parse 8a7f95360 7ef933085 d8bb210ee 186eec720 97ca37d59 | paste -sd'|' -)"  # expected: 0
```
  (The pickaxe string carries the `oid sha256:` prefix on purpose: the manifest `pull.sha256` values in P2 are bare hex and must not match.)
- [ ] **Step 6: No commit** (history only). Ledger row: old tip, new tip, the 5 proof outputs.

## P1: Upload the 3 glbs to Asset Studio (existing endpoint, no new tool)

**What exists / what is missing:** the only scripted one-glb uploader, `$LANE/bin/studio_upload_test.py:1-24`, hardcodes `kind: 'creature'`, `description: 'physics
preview test'` and tags `[atlas, vroid, physics-test]`; it cannot set kind `environment`/`prop`, and the lane is READ-ONLY (no edit). No script uploads an env glb and none
of the 3 has an Asset Studio id yet. The step therefore calls the SAME endpoint with the SAME form fields (`POST {STUDIO}/v1/library/assets/upload?clientId=atlas-world`,
multipart `name, description, kind, rights, tags, file`; asset-studio `README.md:261`, scope `library:write`) through `curl`, with the token from the repo's own
`scripts/lib/studio-token.mjs:9` (`studioToken()`, never printed). Live `/v1/library/kinds?clientId=atlas-world` listed `environment` and `prop` (2026-11-15).
Tag (no env precedent; characters use run tags like `p6s-11071330`, `reviewed:v1`): **`f218-env-pilot-1115`**, recorded in the record's `tags` and the manifest `pull.tag`.

- [ ] **Step 1: Studio up.** `curl -s -o /dev/null -w '%{http_code}\n' http://asset-studio.joymify.local.com/v1/health` -> `200`. Else STOP (Asset Studio down; Gate 1 needs it anyway).
- [ ] **Step 2: Upload x3** (one call per glb; token in an env var, never echoed):

```sh
cd "$WT"
export STUDIO_TOKEN=$(node -e 'import("./scripts/lib/studio-token.mjs").then(m=>{const t=m.studioToken(); if(!t) process.exit(2); process.stdout.write(t)})') || exit 2
up() { curl -sS -f -X POST "http://asset-studio.joymify.local.com/v1/library/assets/upload?clientId=atlas-world" \
  -H "authorization: Bearer $STUDIO_TOKEN" \
  -F "name=$1" -F "description=$2" -F "kind=$3" -F "rights=restricted" \
  -F 'tags=["atlas","env","maro-bell","f218-env-pilot-1115"]' \
  -F "file=@$4;type=model/gltf-binary" > "$SCRATCH/upload-$1.json" && node -e 'const a=require(process.argv[1]); console.log((a.asset??a).id)' "$SCRATCH/upload-$1.json"; }
up maro_gate_tower   "F-218 Maro Bell env pilot r01 gate tower (owner-generated, private)"  environment "$LANE/env/pilot/r01/r01-4k.glb"
up maro_lantern_post "F-218 Maro Bell env pilot r04 lantern post (owner-generated, private)" environment "$LANE/env/pilot/r04/r04.glb"
up maro_barrel       "F-218 Maro Bell env pilot r15 barrel (owner-generated, private)"       prop        "$LANE/env/pilot/r15/r15.glb"
```
  Expected: three UUIDs. A 4xx: read the body in `$SCRATCH/upload-*.json`, do not retry blindly (kind/field validation was not read, `handlers_library.go:93`).
- [ ] **Step 3: Read back the records (source of `pull.sha256`, F-174 rule).** For each id:
  `curl -sS -H "authorization: Bearer $STUDIO_TOKEN" "http://asset-studio.joymify.local.com/v1/library/assets/<id>?clientId=atlas-world" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s); const a=r.asset??r; console.log(a.id,a.sha256,a.kind,a.rights,JSON.stringify(a.tags),a.mediaUrl?"media":"NO-MEDIA")})'`
  Expected: `sha256` equals the lane hash in Global Constraints, `rights restricted`, tag present, `media`. Any sha mismatch: STOP (the studio re-encoded; owner decision).
- [ ] **Step 4: Record** id, tag, sha256 per prop in the ledger (`.superpowers/sdd/plan/progress.md`, not committed). No repo change, no commit.

## P2: Manifest pull entries, ledger rows, tests (test first)

**Files:** `scripts/tests/maro-bell.test.mjs` (test at `:214-237`), `game-client/assets/manifest.json` (3 entries now at `:299-326` on the old tip; after P0 they are
absent), `art-source/LICENSES.md` (3 rows; precedent rows `:721-722`).

- [ ] **Step 1: Failing test.** In `maro-bell.test.mjs` import `isPullOnly` from `../lib/pull-entry.mjs` (`pull-entry.mjs:33`) and replace the file-exists loop
  (`:225-232`) with: entry exists; `isPullOnly(e)`; `e.license === "studio-private"`; `e.render === "model3d"`; no file check (the cache is gitignored and absent in CI,
  `ci.yml:98` runs this file). Rename the test to "every assetPath is a pull-only manifest key; map holds no res:// or studio-cache". Add one test: none of
  `game-client/assets/env/maro_{gate_tower,lantern_post,barrel}.glb` exists in the tree (`existsSync` false).
  Run `node --test scripts/tests/maro-bell.test.mjs`. Expected: the renamed test FAILS with `no manifest entry for env:maro-gate-tower` (entries dropped in P0); the new
  "no committed glb" test passes.
- [ ] **Step 2: Entries.** Add after `npc:maro_folk_girl` (keep the file's 2-space indent and key order of that entry), one per prop, values from P1:

```json
"env:maro-gate-tower": {
  "scene": "res://studio-cache/<sha256>.glb",
  "render": "model3d",
  "kind": "environment",
  "source": "Asset Studio library asset <id> (client atlas-world); bytes not in this repo",
  "license": "studio-private",
  "tier": "bespoke",
  "pull": { "from": "asset-studio", "assetStudioAsset": "<id>", "tag": "f218-env-pilot-1115", "sha256": "<sha256>" }
}
```
  Lantern post: `kind "environment"`; barrel: `kind "prop"`. Expand `pull` over lines as `npc:maro_folk_girl` does (`manifest.json:277-282`).
- [ ] **Step 3: Ledger rows** after `art-source/LICENSES.md:722`, in that row's form:
  `| \`studio-cache/maro_gate_tower.glb\` (pull-only, not in repo) | studio | Asset Studio asset <id>, tag f218-env-pilot-1115 (Tripo, E2 pilot r01, lane env_gate GREEN); owner-generated, private | studio-private | owner | 2026-11-15 | pull-only — \`env:maro-gate-tower\`, bytes fetched by sha256 <first 8 hex>… (F-218) |`
  and the same for lantern post (r04) and barrel (r15). The rev 3 rows `:121-123` are gone after P0 (check with `grep -n maro_ art-source/LICENSES.md`).
- [ ] **Step 4: Green.** `node --test scripts/tests/maro-bell.test.mjs` -> all pass. `node --test scripts/tests/pull-entry.test.mjs scripts/tests/studio-pull.test.mjs` -> pass.
  `ATLAS_SKIP_STUDIO=1 node scripts/check_asset_manifest.mjs` -> 0 FAILURE, 3 `SKIP env:maro-*` lines (CI behaviour, `pull-entry.mjs:50`), 3 UNKNOWN warnings for the `env:` keys.
- [ ] **Step 5: Commit** `feat(manifest): F-218 env:maro-* as Asset Studio pull entries (studio-private, owner pick card 5)` (manifest + LICENSES + test).

## P3: Godot with the cache; behaviour without it

- [ ] **Step 1: Pull.** `node scripts/studio-pull.mjs`. Expected: `studio-pull: 5 pull-only entries` and 5 `✅` lines, 3 of them `pulled <sha12>… (tag f218-env-pilot-1115)`
  (`scripts/studio-pull.mjs:23,33`), exit 0. `ls game-client/studio-cache/{a43acd87,999cfa4f,265ec3f7}*.glb` -> 3 files. `git status --short` -> clean (cache ignored, `.gitignore:151-153`).
- [ ] **Step 2: Manifest gate, local.** `node scripts/check_asset_manifest.mjs` (no skip). Expected: 0 FAILURE (cache hashes right), no SKIP lines.
- [ ] **Step 3: Verify (imports the cold cache first, `scripts/godot-verify.sh:36-60`).**
  `scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL '^\[MaroBellVerify\] VERDICT PASS$'` -> PASS incl. `all 16 assetPath blocks ... have Glb_<id>` (`MaroBellVerify.cs:77`)
  and `barrel props resolved` (`:92`). Then, sequentially, `ATLAS_VERIFY_POC_MARO_10M` (PASS regex from `PocMaro10mVerify.cs` header) and
  `ATLAS_VERIFY_PLAYTEST_SANDBOX '^\[PlaytestSandboxVerify\] VERDICT PASS$'`. Expected: PASS x3; no import error naming a `studio-cache` glb.
- [ ] **Step 4: Without the cache (decided, matches the pulled characters).** Runtime: a missing `res://studio-cache/<sha>.glb` makes `AssetRegistry.Resolve` return the
  Capsule tier (`AssetRegistry.cs:70-92`), which `ResolveAssetScene` (commit `0dc67898a`, `MapChunkStreamer.cs`) treats as a miss: grey `Block_<id>` BoxMesh, no
  barrel, no crash. Gating: `MaroBellVerify` stays STRICT (no relaxation), exactly like `ATLAS_VERIFY_PIPELINE_CHAR`: it runs only in local Gate 1 after
  `studio_pull_required` (`precheck.sh:519-524, 543, 550`), which fails on a cold cache with the studio down; CI runs no Godot (`ci.yml`: 0 `godot` matches) and
  skips pull entries loudly (`ci.yml:69-75`). No code change. Optional proof (one run): `mkdir "$SCRATCH/cold" && mv game-client/studio-cache/{a43acd87,999cfa4f,265ec3f7}* "$SCRATCH/cold/"`,
  run the MaroBell verify -> expected `VERDICT FAIL` with ONLY the `Glb_` and barrel rows red and no crash; then `mv "$SCRATCH/cold/"* game-client/studio-cache/` and re-run -> PASS.
- [ ] **Step 5: No commit** unless a verify needed a code fix (then a fix commit with its own test).

## P4: Thumbs, Game DB shots, docs (F-174 precedent)

- [ ] **Step 1: Thumbs: none.** `node scripts/bake_thumbnails.mjs --only maro --dry-run` -> lists 0 jobs (pull entries skipped, `bake_thumbnails.mjs:116-118`).
  `grep -c 'maro_' game-client/assets/.thumbs/index.json` -> 0. Nothing to commit.
- [ ] **Step 2: Game DB shots (OWNER-VISIBLE CONSEQUENCE).** The 2 rev 3 shots render the private props, and the F-174 rule keeps renders of private assets out of the
  public repo (README "Render strip", `README.md:254-260`; `scripts/check_atlas_web_image.py:19` keeps `game-client/studio-cache/renders` out of the web image). So
  `content/concept-art` gets NO new entry (the rev 3 entries, `art-briefs.json` rows and webps were dropped in P0). Re-render for the owner only:
  `mkdir -p "$WT/game-client/studio-cache/renders/f218"` first (`Save()` does not create the folder, `MaroBellVerify.cs:658-664`), then
  `ATLAS_VERIFY_MARO_BELL=1 ATLAS_RENDER_MARO_BELL="$WT/game-client/studio-cache/renders/f218" "$GODOT" --path game-client` (windowed, `MaroBellVerify.cs:16,103`).
  Expected: `maro-bell-top-down.png`, `maro-bell-eye-gate.png` there, log `VERDICT PASS`; `git status --short` clean. Report line for the owner: "The 2 Maro Bell
  after-shots are not in the Game DB any more, because they show the private models; they live on this Mac only."
- [ ] **Step 3: README.** Re-add the paragraph lost with `186eec720` (`git show 186eec720 -- README.md`, the `**Map blocks with \`assetPath\` (F-218).**` line) unchanged, and
  in the `**Pull-only assets (F-174).**` paragraph (`README.md:225` on release) add one sentence: "F-218 adds the 3 Maro Bell environment pilot props
  (`env:maro-gate-tower`, `env:maro-lantern-post`, `env:maro-barrel`) the same way." Do NOT re-add the rev 3 "Exception: F-218 commits ... as LFS files" text.
  `docs/asset-intake.md`: no change (the rev 3 exception line went with P0; confirm `grep -n F-218 docs/asset-intake.md` -> empty).
- [ ] **Step 4: Commit** `docs: F-218 README for assetPath blocks and the env pull entries`.

## P5: Sync and full verification

- [ ] **Step 1:** `psrw sync` (release may have moved). Expected: up to date or a clean merge.
- [ ] **Step 2: Verify list** (all from `$WT`, each output kept for the PR text):
  - `node --test scripts/tests` -> 0 fail (`npm test --prefix scripts` is what CI runs, `ci.yml:98`; run it too).
  - `node --test atelier/atlas-world-panels/tests/*.test.mjs` -> 0 fail.
  - `node scripts/check_asset_manifest.mjs` -> 0 FAILURE; and `ATLAS_SKIP_STUDIO=1 node scripts/check_asset_manifest.mjs` -> 0 FAILURE with the SKIP lines (CI view).
  - `scripts/precheck.sh --no-install` -> green (pulls, runs the 4 Godot verifies, `precheck.sh:516-552`).
  - `(cd server-rs && cargo test)` -> green, incl. `loads_maro_bell_grey_box_map_with_authored_spawn`.
- [ ] **Step 3: Phone + desktop captures** = `plan.md` Task 7 Steps 1-3 unchanged (commands `plan.md:350-355`), with a warm studio cache. Images stay in `$SCRATCH`, are
  `Read`, and shown to the owner (`~/.local/bin/img-preview-link -m <img>` if remote). No commit.

## P6: One consolidated review (R1: public repo)

ONE reviewer on `git diff 7c218a8a5..feat/F-218` plus the P0 proof outputs. Checklist:
- [ ] No `*.glb` and no LFS pointer for the 3 props in any reachable commit (re-run P0 Step 5); `git lfs ls-files feat/F-218 | grep -c maro_` -> 0.
- [ ] No tracked `.import`, `_Color_*.jpg`, thumb webp, `.thumbs/index.json` row or concept-art image for the 3 props; nothing tracked under `game-client/studio-cache/`.
- [ ] No private path in any committed file: `git diff 7c218a8a5..feat/F-218 | grep -n -E 'asset-studio-private|/Users/|atlas-3d-plan'` -> only lines inside the
  plan/spec under `.claude/refined_backlog/` and `docs/superpowers/specs/` that name the read-only lane (accepted as in rev 3), none in `game-client/`, `content/`,
  `art-source/`, `README.md`, `scripts/`.
- [ ] The 3 `pull.sha256` values equal the lane hashes in Global Constraints AND the Asset Studio records (P1 Step 3); `scene` = `res://studio-cache/<that sha>.glb`.
- [ ] `license` `studio-private` on exactly the 3 new entries + the 2 existing pull entries; LICENSES rows match ids/tags.
- [ ] `staticObstacles` diff vs release shows only the 2 gate rows (`git diff release/1.34 -- content/maps/maro-bell.json | grep -A3 staticObstacles`; AC4).
- [ ] `refs/backup/F-218-lfs-tip` exists locally and is on no remote. One fix round, one scoped re-review, `/simplify`, re-run P5 Step 2.

## P7: Ship and local deploy = `plan.md` Task 10 without the LFS steps

Run `plan.md` Task 10 with these line changes:
- `plan.md:400` Step 1: drop "Record the `sha256sum` of the 3 glbs ... integrity is the LFS oid"; instead paste the P1 id/tag/sha256 table into the PR text.
- `plan.md:401` Step 2 (`psrw ship`): unchanged. Before it, re-run P0 Step 5 (must still be empty).
- `plan.md:402` Step 3 ("LFS objects reach the remote"): DELETE; replace with `git lfs ls-files release/1.34 | grep -c maro_` -> 0 after ship.
- `plan.md:403` Step 4: keep "deploy from `_release` on release/1.34"; drop the sentence "Requires the 3 LFS objects present locally ...".
- `plan.md:404` Step 5: drop "confirm the 2 new entries render"; instead confirm `curl` of the concept-art index has no `maro-bell-env-pilot` id. The props show only in the
  local Godot run with a warm cache: say that to the owner.
- `plan.md:405` Step 6: unchanged, plus the owner-visible line from P4 Step 2.
- After ship and deploy: `git update-ref -d refs/backup/F-218-lfs-tip` (R1, state it first; the commits then stay only in the reflog until gc).

## AC to task map (rev 4)

| AC | Proven by |
|---|---|
| 0 studio records, sha pairs, nothing committed | P0 Step 5, P1 Step 3, P3 Step 1, P6 |
| 1 lane `env_gate.py` GREEN x3 | `plan.md` Task 5 Step 1 (done, Batch C; gate JSONs in the ledger dir) |
| 2 `check_asset_manifest.mjs` 0 FAILURE (local and skip mode) | P2 Step 4, P3 Step 2, P5 |
| 3 maro-bell, poc-maro, canon tests | P2, P5 |
| 4 only 2 obstacle rows | P6 |
| 5 Godot verifies | P3 Step 3, P5 |
| 6 `cargo test` | P5 |
| 7 shots (not in Game DB) + phone/desktop | P4 Step 2, P5 Step 3 |
| 8 Gate 1 + ship | P5, P7 |
| 9 deploy + `/api/runtime` | P7 |
