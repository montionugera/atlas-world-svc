# Handoff: Atlas World Web Studio (`http://127.0.0.1:8788`) — Full-Width Layout & Release `1.16`

## 1. Current State (100% Complete & Live)
- **Active Release Worktree**: `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release` (`release/1.16`, commit `5cba175f9`, pushed to `origin/release/1.16`).
- **Live Web App Server**: Running on `http://127.0.0.1:8788/#perspective=world-history-and-concept` (`PID 62195` from `.claude/worktrees/_release/scripts/catalog_explorer_web.py`).
- **Mac App Retired**:
  - Removed `/Applications/AtlasObservatory.app` and `build/AtlasObservatory.app`.
  - Updated `scripts/build_mac_observatory.sh` so it no longer installs `/Applications/AtlasObservatory.app` by default and `--open` opens `http://127.0.0.1:8788` in the web browser.
- **Web App Full-Width & Zero-Clipping Upgrades (`scripts/catalog_explorer_web.py`)**:
  - Removed the `max-width: 1260px` container cap on `.content-area` (`max-width: 100%; overflow-x: hidden`).
  - Placed all 4 Perspective Big-Picture SVG diagrams (`renderWhcBigPictureSvg`, `renderContinentBigPictureSvg`, `renderDistrictBigPictureSvg`, `renderTownOrHuntingAreaBigPictureSvg`) at full width at the top of each perspective.
  - Replaced the cramped 3-column layout in **Step 3 (`District`)** with a full-width **Maxion Level-Band & Monster Pinning Toolbar** above the **Connected Map Matrix** inside `.studio-split-layout` (`minmax(0, 1fr) 340px`).
  - Compacted `.topbar` into a single `52px` row.
  - Universal 3D `.webp` thumbnail resolver (`resolve_thumb_file`) serves all 633 `.glb` / 749 `.webp` thumbnails with zero 404s across all 94 Playable Canon Studio Maps + 25 Classic Maps (`123 Maps`) and 94 Studio Monsters + 36 Classic Monsters (`161 Mobs`).

## 2. Verification
- `python3 -m unittest tests/test_studio_web_perspectives.py -v` -> `5/5 OK` (`0.061s`).
- `http://127.0.0.1:8788` verified live with zero 404s and full-width responsive layout.

## 3. Ready for Next User Request
- Stand by in this fresh thread for the user's next instruction or feedback on the Web Studio (`http://127.0.0.1:8788`).
