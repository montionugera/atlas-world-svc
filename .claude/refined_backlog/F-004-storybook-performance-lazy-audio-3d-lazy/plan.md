# Asset-Storybook performance — Implementation Plan

Implementation is complete and validated live (user: "much smoother"); the diff
is staged in `scratchpad/storybook-improvements.patch` (built against the shipped
`tools/asset-storybook/index.html`). Landing = apply that patch to the tracked
file in the F-004 worktree, verify, ship.

## Task 1 — apply the perf patch to `tools/asset-storybook/index.html`

Nine hunks, all in the inline `<script>` (+ one CSS `.filesize` rule):
- SFX: `warmups[]` + `IntersectionObserver` on the soundboard; per-tile
  `ensureDecode()` guarded by `decodeStarted`; `play()` calls `ensureDecode()`.
- Size probe: `SIZE_PROBE_CONCURRENCY` HEAD queue + `fmtBytes` + `attachFileSize`;
  `.filesize` span added in `buildCardShell`.
- 3D: `buildModel3d` rewritten — lazy `mount()`/`dispose()`, `applyMotion()`
  hover gate, two IntersectionObservers, `counted` health guard.

**Verify:** `node --check` on the extracted inline script; serve at
`localhost:8097` and confirm `audio_at_rest 0`, `real_glb_downloads 0`,
`model_viewers_mounted_at_rest 0`, `filesize 61/61`, hover→mount, far-scroll→dispose.
**Review:** independent diff review (fresh subagent / `/code-review`).
**Refactor:** kill any duplication introduced; re-verify.

## Task 2 — clean up

Remove the throwaway `tools/asset-storybook/index.dev.html` and stop the local
static server. Prettier-clean the touched file.

## Ship

`/ps-release-workflow:ship` from the F-004 worktree (Gate 1 precheck → merge into
`release/1.2`).
