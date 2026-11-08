# Interactive Playtest Sandbox client: shared World engine scene, live customizer, combat dummies and foot-grounding inspector — Implementation Plan

## Phase 1: Playtest Sandbox Scene & Controller (`PlaytestSandbox.tscn` + `PlaytestSandboxRoot.cs`)
1. Create `game-client/scenes/PlaytestSandbox.tscn` with a clean 3D environment (`WorldEnvironment`, `DirectionalLight3D`, `Floor`, `EnvironmentProps`, `Camera3D`, `ServerRsConnection`, and a `UI` `CanvasLayer`) bound to `PlaytestSandboxRoot.cs`.
2. Implement `game-client/src/World/PlaytestSandboxRoot.cs` sharing the real `AtlasWorld.Client.World` engine classes (`UnifiedMapDocument`, `TerrainElevation`, `MapChunkStreamer`, `DayNightCycleController`, `SmartCameraOccluder`, `AssetRegistry`, `AudioRegistry`, `EntityView`, `AnimationController`, `CharacterCustomization`, `WeaponSocket`, `ServerRsConnection`, `EntityManager`):
   - **Movement & Camera:** WASD / Arrow keys movement with `Shift` or `[G]` toggle between Run (`3.0 m/s`) and Walk (`0.9 m/s`), `TerrainElevation.ResolveSteepSlopeMove` obstacle & height resolution, Right-Mouse drag orbit + Mouse Wheel zoom, and `SmartCameraOccluder` line-of-sight fading.
   - **Combat & Reactive Target Dummies:** Spawn interactive Target Dummies in Maro Bell Plaza (and Arrival Gate) with 3D overhead HP bars and nameplates (`Straw Training Dummy`, `Armored Kiln Dummy`, `Agile Scout Dummy`). Pressing `Space` / Left-Click (on canvas) / `[Attack]` button triggers `AnimationController.Attack()` (upper-body blend while moving, cycling `attack` -> `attack_2` -> `attack_3` combos), plays weapon swing SFX, and deals melee hits to dummies within range (playing hit-react animation, scale punch, floating 2D damage numbers, and auto-refilling dummy HP on defeat).
   - **Live Character Customizer:**
     - **Hair Color:** Cycle or click swatches (`MaroChestnut`, `LindeSilver`, `SolarBlonde`, `CrimsonRose`, `SilmeAzure`, `ObsidianNight`) via `CharacterCustomization.SetHairColor`.
     - **Sword Look Swap:** Cycle or click 1H weapon variants (`sword`, `kk_sword_a`, `kk_sword_b`, `claymore`, `axe`, `unarmed`) via `WeaponSocket.EquipByKey`.
     - **Character Rig Switcher:** Switch live avatar between `npc:maro_folk_girl`, `player` (`player_knight`), and any manifest `pipelineCharacter` entries (so future `Linde Folk` elf and `Silme Seers` rigs appear automatically) while preserving position, hair tint, and equipped weapon.
   - **Map, Landmark Teleporter & Foot-Grounding Inspector:**
     - Teleport buttons/hotkeys (`Arrival Gate`, `Market Bend`, `Lantern Row`, `Bell Terrace / Dummies`).
     - Map switcher (`maro-bell` <-> `freja-south-gate`).
     - Live Foot-Grounding & Animation Inspector HUD (`Speed m/s`, `Locomotion State`, `Upper-Body Attack Active`, `Combo Step`, `Foot Min Offset mm` sampled live from `LeftFoot`/`RightFoot`/`LeftToeBase`/`RightToeBase` global Y vs terrain Y).
     - Optional `Connect Server-RS` / `Offline Sandbox` toggle.
3. Add `scripts/run_playtest.sh` to build `GameClient.csproj` and launch Godot Mono directly into `res://scenes/PlaytestSandbox.tscn` (with `ATLAS_MAP_ID=maro-bell` default).

## Phase 2: Headless Verification Probe (`PlaytestSandboxVerify.cs`) & Showcase Render
1. Create `game-client/src/World/PlaytestSandboxVerify.cs` and wire `ATLAS_VERIFY_PLAYTEST_SANDBOX=1` in `VerticalSliceRoot.cs` (and `PlaytestSandboxRoot.cs`) + `scripts/precheck.sh`:
   - Instantiates `PlaytestSandboxRoot` on `maro-bell`.
   - Asserts `npc:maro_folk_girl` is spawned, grounded (`FootMinOffsetMeters >= -0.005f`), and `WeaponSocket` has `sword` equipped.
   - Simulates walk (`0.9 m/s`) and run (`3.0 m/s`) movement steps, verifying `AnimationController.CurrentState` transitions (`idle` -> `walk` -> `run`) and position advances.
   - Triggers `Attack()` while moving at `3.0 m/s` next to a target dummy, asserting upper-body attack blend is active while legs run and the dummy takes damage (`CurrentHp < MaxHp`).
   - Cycles 3 hair colors (`SetHairColor`), 3 sword variants (`EquipByKey`), switches character rig (`npc:maro_folk_girl` -> `player` -> `npc:maro_folk_girl`), and teleports across Maro Bell landmarks.
   - When `ATLAS_RENDER_PLAYTEST_SANDBOX=<dir>` is set, captures high-res screenshots of the interactive Playtest Sandbox UI in action.
2. Run `scripts/godot-verify.sh ATLAS_VERIFY_PLAYTEST_SANDBOX '^\[PlaytestSandboxVerify\] VERDICT PASS$'`, capture showcase screenshots into `game-client/studio-cache/renders/maro-bell-girl/`, update the viewer page, run Gate 1 (`./scripts/precheck.sh --no-install`), and ship `F-188`.
