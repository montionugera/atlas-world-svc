---
title: "Interactive Playtest Sandbox client: shared World engine scene, live customizer, combat dummies and foot-grounding inspector"
id: I-271
status: idea
---

# Interactive Playtest Sandbox client: shared World engine scene, live customizer, combat dummies and foot-grounding inspector

## Goal
Build an interactive **Godot 4 Playtest Sandbox Client** (`game-client/scenes/PlaytestSandbox.tscn` + `game-client/src/World/PlaytestSandboxRoot.cs` + `scripts/run_playtest.sh`) that shares core engine code (`AnimationController`, `CharacterCustomization`, `WeaponSocket`, `MapChunkStreamer`, `TerrainElevation`, `EntityView`, `ServerRsConnection`) without the legacy ROX mobile HUD/timers (`VerticalSlice.tscn`), so the owner and developers can interactively walk/run at 3 m/s, test upper-body attack blending and 1-2-3 combos against reactive target dummies, swap hair colors / 1H sword looks / character rigs (`npc:maro_folk_girl`, `player`, and future `Linde Folk` / `Silme Seers`) live, switch maps/landmarks (`maro-bell`, `freja-south-gate`), and inspect live foot-grounding (`min_y`) and optional `server-rs` sync.

## Problem
1. **`VerticalSlice.tscn` is overloaded with legacy ROX mobile HUD:** Launching `game-client` today boots `VerticalSliceRoot.cs` (2,373 lines) with mobile thumbsticks, auto-combat timers, War of Emperium siege popups, and legacy Freja quest overlays.
2. **Probes (`MaroBellVerify`, `PipelineCharVerify`) are non-interactive:** They verify assertions and render static PNGs/GIFs headlessly, but you cannot interactively drive the character with WASD + Mouse, test upper-body attack feel while weaving around Maro Bell, or click buttons to swap hair colors, swords, and character rigs on the fly.
3. **Need a clean shared-engine testbed:** As new characters (`Linde Folk` elf, `Silme Seers`), weapons, and grey-box towns land, we need a lightweight interactive client inside `game-client/` that reuses the exact C# `World/` classes without duplicating or coupling to the full mobile game UI.

## Decisions (batch-grill, 2026-11-08)
- **Structure** -> **Clean Godot 4 Sandbox Scene (`PlaytestSandbox.tscn` + `scripts/run_playtest.sh`)** inside `game-client/` sharing `AnimationController`, `CharacterCustomization`, `WeaponSocket`, `MapChunkStreamer`, and `TerrainElevation` with a compact test toolbar and zero legacy ROX HUD clutter.
- **Networking mode** -> **Offline-first local sandbox** (instant startup, local target dummies + Maro Bell town, plus an optional toggle to connect to live `server-rs` when running).
- **Interactive controls** ->
  1. **Movement + Combat:** WASD walk/run (Shift or toggle for walk 0.9 m/s vs run 3.0 m/s), Left-Click / `Space` attack with upper-body blend while moving, 1-2-3 combo cycling (`attack`, `attack_2`, `attack_3`), and reactive target dummies in Maro Bell plaza with floating damage, hit-flash, and hit-react animation.
  2. **Live Character Customizer:** Instant UI buttons & hotkeys for Hair Color tint (`MaroChestnut`, `LindeSilver`, `SolarBlonde`, `CrimsonRose`, `SilmeAzure`, `ObsidianNight`), 1H Sword model swap (`sword`, `kk_sword_a`, `kk_sword_b`, `claymore`, `axe`, `none`), and Avatar/Rig switcher (`npc:maro_folk_girl`, `player` knight, plus auto-discovery of any `pipelineCharacter` or `race:*` in `manifest.json` so new Elf/Silme rigs appear automatically).
  3. **Map, Teleport & Foot-Grounding Inspector:** Switch between `maro-bell` and `freja-south-gate`, teleport between key landmarks (`Arrival Gate`, `Market Bend`, `Lantern Row`, `Bell Terrace / Dummies`), orbit/zoom camera (Right-drag + Scroll wheel), and a live telemetry HUD showing speed (`m/s`), active locomotion state, upper-body attack state, and real-time foot bone elevation above ground (`foot_min_offset_mm`) so any leg-sinking regression is immediately visible.

## Architecture & Shared Engine Reuse
1. **Scene & Entrypoint (`game-client/scenes/PlaytestSandbox.tscn` + `scripts/run_playtest.sh`):**
   - `scripts/run_playtest.sh` builds `GameClient.csproj` and launches Godot Mono directly into `res://scenes/PlaytestSandbox.tscn` (defaulting to `ATLAS_MAP_ID=maro-bell` at `1440x900` desktop window).
   - Also reachable via `ATLAS_PLAYTEST_SANDBOX=1` or direct scene path so `scripts/godot-verify.sh` can run `ATLAS_VERIFY_PLAYTEST_SANDBOX=1` headlessly in Gate 1.
2. **Core Controller (`game-client/src/World/PlaytestSandboxRoot.cs`):**
   - Reuses `UnifiedMapDocument`, `TerrainElevation`, `MapChunkStreamer`, `DayNightCycleController`, `SmartCameraOccluder`, `AssetRegistry`, `AudioRegistry`, `EntityView`, `AnimationController`, `CharacterCustomization`, `WeaponSocket`, and optional `ServerRsConnection` + `EntityManager`.
   - Spawns a local interactive Combat Dummy ring in Maro Bell Plaza (and arrival gate) with 3D HP bars, hit-react animations, and damage popups so melee range, facing, and upper-body attack-on-the-move can be felt immediately without needing a server.
   - Provides a clean, compact **Playtest Dock UI** (top-left telemetry + bottom/left collapsible pill bar with clickable buttons and keyboard shortcuts `[1-6]` Hair, `[Q/E]` or buttons for Sword, `[R]` Rig, `[G]` Gait Walk/Run, `[T]` Teleport landmark, `[M]` Map, `[N]` Net connect/offline, `[Space/LMB]` Attack).

## Acceptance Criteria
- [ ] `game-client/scenes/PlaytestSandbox.tscn` and `game-client/src/World/PlaytestSandboxRoot.cs` exist and compile cleanly with zero warnings/errors in `GameClient.csproj`.
- [ ] `scripts/run_playtest.sh` launches the interactive Playtest Sandbox in `maro-bell` with `npc:maro_folk_girl` grounded on the terrain (`foot_min_offset >= -2 mm`).
- [ ] Shared engine controls work both via clickable UI buttons and hotkeys:
  - Walk (0.9 m/s) and Run (3.0 m/s) movement with `TerrainElevation.ResolveSteepSlopeMove` obstacle collision and smooth camera orbit/zoom.
  - Attack (`Space` / Left-Click / UI button) triggers upper-body attack blend while moving, cycles `attack` -> `attack_2` -> `attack_3` combos, and hits nearby target dummies (reducing dummy HP, playing hit react + SFX + floating damage).
  - Live Hair Color switcher (`SetHairColor` across >= 5 presets) and Live Sword switcher (`WeaponSocket.EquipByKey` across `sword`, `kk_sword_a`, `kk_sword_b`, `claymore`, `axe`).
  - Live Character Rig switcher (`npc:maro_folk_girl`, `player`, and any manifest `pipelineCharacter` entries).
  - Landmark teleporter (`Arrival Gate`, `Market Bend`, `Lantern Row`, `Bell Terrace`) and Map switcher (`maro-bell` <-> `freja-south-gate`).
  - Optional live `server-rs` toggle (`Connect Server-RS` / `Offline Sandbox`).
- [ ] Headless verification probe (`ATLAS_VERIFY_PLAYTEST_SANDBOX=1` via `scripts/godot-verify.sh` and wired into `scripts/precheck.sh`) exercises spawning `PlaytestSandboxRoot`, moving at walk/run speed, attacking a dummy while moving, cycling hair colors, cycling swords, switching rigs, teleporting landmarks, and verifying foot grounding (`>= -0.005 m`), printing `[PlaytestSandboxVerify] VERDICT PASS`.
- [ ] Windowed showcase screenshots of the interactive Playtest Sandbox UI in action are rendered to `game-client/studio-cache/renders/maro-bell-girl/` and viewable on the edit host (`http://atlas-edit.joymify.local.com/game-client/studio-cache/renders/maro-bell-girl/index.html`).
- [ ] Gate 1 (`./scripts/precheck.sh --no-install`) passes green.
