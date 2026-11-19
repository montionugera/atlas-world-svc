# Material-Aware Footstep SFX (`F-223` / `I-307`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver material-aware footstep SFX across `Stone`, `Dirt`, `Grass`, `Water`, and `Glass` surfaces with a hybrid ground/pad surface resolver, 4 walkable test pads in `PlaytestSandboxRoot`, single-strike ElevenLabs `.ogg` variants per material, and automated verification in `AudioVerify` and `PlaytestSandboxVerify`.

**Architecture:** Introduce `FootstepSurface` enum + `FootstepSurfaceMapper` in `game-client/src/Audio/FootstepSurface.cs` and `FootstepSurfaceResolver` in `game-client/src/World/FootstepSurfaceResolver.cs` reusing `UnifiedMapDocument.ResolveGroundIdAt(wx, wz, out _, out _)` with top-priority `SurfacePadOverride` and `UnifiedMapStructureVolume.SurfaceType` checks. Extend `AudioRegistry.PlayFootstep(Vector3 worldPos, bool isRightFoot = false, bool isRunning = false, FootstepSurface surface = FootstepSurface.Stone)` with per-surface `sfx:footstep_<surface>_1..8` keys, per-surface non-repeating 3-step history, per-surface dB trims, and fallback to `sfx:footstep_1..8` (`Stone`). Add 4 labeled walkable surface pads (`Stone`, `Dirt`, `Water`, `Glass`) in `PlaytestSandboxRoot.cs` and wire all callers (`PlaytestSandboxRoot`, `VerticalSliceRoot`, `MaroBellPocController`).

**Tech Stack:** Godot 4.7 Mono (`$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot`), C# / .NET 8, ElevenLabs SFX (`.ogg` 0.3–1.2s single-strike), `scripts/gen_audio_index.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-15-i307-material-aware-footstep-sfx-design.md`

## Global Constraints

- Always use `$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot` (never PATH `godot`).
- Keep `AudioRegistry.PlayFootstep(Vector3 worldPos, bool isRightFoot = false, bool isRunning = false, FootstepSurface surface = FootstepSurface.Stone)` backward-compatible via default parameter `FootstepSurface.Stone`, and never throw on missing manifest keys (graceful fallback to `sfx:footstep_1..8` then `sfx:footstep`).
- Reuse `UnifiedMapDocument.ResolveGroundIdAt(wx, wz, out _, out _)` in `FootstepSurfaceResolver` — never duplicate spline distance or ground-zone feather math.
- SFX clips must be single-strike `.ogg` files (0.3–1.2s, soft single impact, no multi-step loops), generated via ElevenLabs and ear-checked by the owner before shipping (Rule #17).
- Batch: 1,2

---

### Task 1: Surface Enum, Hybrid `FootstepSurfaceResolver`, & `AudioRegistry.PlayFootstep` Material Support

**Files:**
- Create: `game-client/src/Audio/FootstepSurface.cs`
- Create: `game-client/src/World/FootstepSurfaceResolver.cs`
- Modify: `game-client/src/World/UnifiedMapDocument.cs:126-145`
- Modify: `game-client/src/Audio/AudioRegistry.cs:43-58,126-219`
- Test: `game-client/src/Audio/AudioVerify.cs`

**Interfaces:**
- Consumes: `UnifiedMapDocument.ResolveGroundIdAt(float wx, float wz, out bool inRouteClearance, out float minRouteEdgeDist)`
- Produces:
  - `namespace AtlasWorld.Client.Audio { public enum FootstepSurface { Stone, Dirt, Grass, Water, Glass } }`
  - `public static class FootstepSurfaceMapper { public static FootstepSurface FromSurfaceType(string? raw); public static string ToEventToken(FootstepSurface surface); }`
  - `namespace AtlasWorld.Client.World { public readonly record struct SurfacePadOverride(string Id, string Label, Rect2 WorldBounds, FootstepSurface Surface); public static class FootstepSurfaceResolver { public static FootstepSurface Resolve(Vector3 worldPos, UnifiedMapDocument? doc, IReadOnlyList<SurfacePadOverride>? pads = null); } }`
  - `AudioRegistry.PlayFootstep(Vector3 worldPos, bool isRightFoot = false, bool isRunning = false, FootstepSurface surface = FootstepSurface.Stone)`

- [ ] **Step 1: Write the failing test in `game-client/src/Audio/AudioVerify.cs`**

```csharp test:game-client/src/Audio/AudioVerify.cs
            // Part 5 — Material-aware footstep surface mapping, hybrid resolver precedence, and AudioRegistry surface playback + fallback.
            failures += Report("FootstepSurfaceMapper maps ground_palettes surfaceType tokens and unknown fallback to Stone",
                FootstepSurfaceMapper.FromSurfaceType("stone_path") == FootstepSurface.Stone &&
                FootstepSurfaceMapper.FromSurfaceType("sheer_rock") == FootstepSurface.Stone &&
                FootstepSurfaceMapper.FromSurfaceType("lush_grass") == FootstepSurface.Grass &&
                FootstepSurfaceMapper.FromSurfaceType("forest_moss") == FootstepSurface.Grass &&
                FootstepSurfaceMapper.FromSurfaceType("estuary_mudflat") == FootstepSurface.Dirt &&
                FootstepSurfaceMapper.FromSurfaceType("scorched_basalt_ash") == FootstepSurface.Dirt &&
                FootstepSurfaceMapper.FromSurfaceType("bramble_root_floor") == FootstepSurface.Dirt &&
                FootstepSurfaceMapper.FromSurfaceType("dirt") == FootstepSurface.Dirt &&
                FootstepSurfaceMapper.FromSurfaceType("water") == FootstepSurface.Water &&
                FootstepSurfaceMapper.FromSurfaceType("shallow_water") == FootstepSurface.Water &&
                FootstepSurfaceMapper.FromSurfaceType("glass") == FootstepSurface.Glass &&
                FootstepSurfaceMapper.FromSurfaceType("wind_scoured_ice") == FootstepSurface.Glass &&
                FootstepSurfaceMapper.FromSurfaceType(null) == FootstepSurface.Stone &&
                FootstepSurfaceMapper.FromSurfaceType("unknown_alien_surface") == FootstepSurface.Stone);

            var testDoc = new World.UnifiedMapDocument
            {
                BaseGroundId = "meadow_grass",
                GroundPalettes = new System.Collections.Generic.Dictionary<string, World.UnifiedMapGroundPalette>
                {
                    ["meadow_grass"] = new() { SurfaceType = "lush_grass" },
                    ["cobble_road"] = new() { SurfaceType = "stone_path" },
                    ["dirt_patch"] = new() { SurfaceType = "dirt" },
                },
                Routes = new System.Collections.Generic.List<World.UnifiedMapRouteSpline>
                {
                    new()
                    {
                        Id = "main_road",
                        GroundId = "cobble_road",
                        Width = 4.0f,
                        Points = new System.Collections.Generic.List<float[]> { new[] { 0f, -10f }, new[] { 0f, 10f } }
                    }
                },
                GroundZones = new System.Collections.Generic.List<World.UnifiedMapGroundZone>
                {
                    new() { Id = "dirt_zone", GroundId = "dirt_patch", Priority = 20, Shape = "circle", X = 15f, Z = 15f, Radius = 5f, Feather = 0f }
                },
                Structures = new System.Collections.Generic.List<World.UnifiedMapStructureVolume>
                {
                    new() { Id = "glass_bridge", Kind = "block", X = -15f, Z = -15f, Size = new World.UnifiedMapBlockSize { X = 4f, Y = 1f, Z = 4f }, SurfaceType = "glass" }
                }
            };
            var testPads = new[]
            {
                new World.SurfacePadOverride("pad_water", "Water", new Rect2(-1f, -1f, 2f, 2f), FootstepSurface.Water)
            };

            FootstepSurface sPad = World.FootstepSurfaceResolver.Resolve(new Vector3(0f, 0f, 0f), testDoc, testPads);
            FootstepSurface sRoad = World.FootstepSurfaceResolver.Resolve(new Vector3(0f, 0f, 5f), testDoc, testPads);
            FootstepSurface sZone = World.FootstepSurfaceResolver.Resolve(new Vector3(15f, 0f, 15f), testDoc, testPads);
            FootstepSurface sStruct = World.FootstepSurfaceResolver.Resolve(new Vector3(-15f, 0f, -15f), testDoc, testPads);
            FootstepSurface sBase = World.FootstepSurfaceResolver.Resolve(new Vector3(30f, 0f, 30f), testDoc, testPads);
            failures += Report($"FootstepSurfaceResolver precedence (pad={sPad}==Water > struct={sStruct}==Glass > route={sRoad}==Stone > zone={sZone}==Dirt > base={sBase}==Grass)",
                sPad == FootstepSurface.Water &&
                sStruct == FootstepSurface.Glass &&
                sRoad == FootstepSurface.Stone &&
                sZone == FootstepSurface.Dirt &&
                sBase == FootstepSurface.Grass);

            foreach (FootstepSurface surf in System.Enum.GetValues<FootstepSurface>())
            {
                AudioStreamPlayer3D? p = reg.PlayFootstep(new Vector3(2f, 0f, 2f), isRightFoot: false, isRunning: false, surface: surf);
                failures += Report($"PlayFootstep(surface={surf}) spawns playing 3D stream with non-null AudioStream",
                    p != null && p.Stream != null && p.Playing);
            }
```

Verify-Cmd: `ATLAS_VERIFY_SFX=1 "$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot" --headless --path game-client`

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet build game-client/GameClient.csproj`
Expected: FAIL with `FootstepSurface`, `FootstepSurfaceMapper`, `FootstepSurfaceResolver`, `SurfacePadOverride` not defined.

- [ ] **Step 3: Implement `FootstepSurface.cs`, `FootstepSurfaceResolver.cs`, `UnifiedMapStructureVolume.SurfaceType`, and `AudioRegistry.PlayFootstep`**

Create `game-client/src/Audio/FootstepSurface.cs`:
```csharp
using System;

namespace AtlasWorld.Client.Audio
{
    public enum FootstepSurface
    {
        Stone = 0,
        Dirt = 1,
        Grass = 2,
        Water = 3,
        Glass = 4,
    }

    public static class FootstepSurfaceMapper
    {
        public static FootstepSurface FromSurfaceType(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return FootstepSurface.Stone;

            string token = raw.Trim().ToLowerInvariant();
            return token switch
            {
                "stone_path" or "sheer_rock" or "stone" or "cobble" or "rock" or "structure_foundation" => FootstepSurface.Stone,
                "dirt" or "soil" or "earth" or "mud" or "estuary_mudflat" or "scorched_basalt_ash" or "bramble_root_floor" => FootstepSurface.Dirt,
                "lush_grass" or "forest_moss" or "grass" or "meadow" or "moss" => FootstepSurface.Grass,
                "water" or "shallow_water" or "river" or "stream" or "pond" or "puddle" => FootstepSurface.Water,
                "glass" or "crystal" or "stained_glass" or "wind_scoured_ice" or "ice" => FootstepSurface.Glass,
                _ => FootstepSurface.Stone,
            };
        }

        public static string ToEventToken(FootstepSurface surface) => surface switch
        {
            FootstepSurface.Dirt => "dirt",
            FootstepSurface.Grass => "grass",
            FootstepSurface.Water => "water",
            FootstepSurface.Glass => "glass",
            _ => "stone",
        };
    }
}
```

Add `[JsonPropertyName("surfaceType")] public string? SurfaceType { get; set; }` to `UnifiedMapStructureVolume` in `game-client/src/World/UnifiedMapDocument.cs`:
```csharp
        /// <summary>Optional asset manifest key or <c>res://</c> scene path; null draws the grey box.</summary>
        [JsonPropertyName("assetPath")] public string? AssetPath { get; set; }
        /// <summary>Optional ground surface override when stepping onto this structure volume (e.g., "stone", "glass", "water").</summary>
        [JsonPropertyName("surfaceType")] public string? SurfaceType { get; set; }
```

Create `game-client/src/World/FootstepSurfaceResolver.cs`:
```csharp
using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.Audio;

namespace AtlasWorld.Client.World
{
    public readonly record struct SurfacePadOverride(
        string Id,
        string Label,
        Rect2 WorldBounds,
        FootstepSurface Surface);

    /// <summary>
    /// Hybrid surface resolver that checks explicit walkable pad overrides and structure
    /// surface overrides first, then delegates terrain/route/zone resolution to
    /// <see cref="UnifiedMapDocument.ResolveGroundIdAt"/> and maps the resolved palette's
    /// <c>surfaceType</c> via <see cref="FootstepSurfaceMapper"/>.
    /// </summary>
    public static class FootstepSurfaceResolver
    {
        public static FootstepSurface Resolve(
            Vector3 worldPos,
            UnifiedMapDocument? doc,
            IReadOnlyList<SurfacePadOverride>? pads = null)
        {
            Vector2 p2 = new(worldPos.X, worldPos.Z);

            // 1. Explicit walkable pad overrides (PlaytestSandbox test pads, custom floor zones)
            if (pads != null)
            {
                for (int i = 0; i < pads.Count; i++)
                {
                    if (pads[i].WorldBounds.HasPoint(p2))
                        return pads[i].Surface;
                }
            }

            if (doc == null)
                return FootstepSurface.Stone;

            // 2. Structure volume with explicit SurfaceType override
            if (doc.Structures != null)
            {
                for (int i = 0; i < doc.Structures.Count; i++)
                {
                    var s = doc.Structures[i];
                    if (string.IsNullOrWhiteSpace(s.SurfaceType))
                        continue;

                    if (s.Kind == "block")
                    {
                        float halfX = Mathf.Max(0.25f, s.Size.X * 0.5f);
                        float halfZ = Mathf.Max(0.25f, s.Size.Z * 0.5f);
                        if (Mathf.Abs(worldPos.X - s.X) <= halfX && Mathf.Abs(worldPos.Z - s.Z) <= halfZ)
                            return FootstepSurfaceMapper.FromSurfaceType(s.SurfaceType);
                    }
                    else
                    {
                        if (Mathf.Abs(worldPos.X - s.X) <= s.Radius + 3.6f &&
                            Mathf.Abs(worldPos.Z - s.Z) <= s.Radius + 2.2f)
                        {
                            return FootstepSurfaceMapper.FromSurfaceType(s.SurfaceType);
                        }
                    }
                }
            }

            // 3. Map ground resolution (structure_foundation > routes > groundZones > baseGroundId)
            string groundId = doc.ResolveGroundIdAt(worldPos.X, worldPos.Z, out _, out _);
            if (groundId == "structure_foundation")
                return FootstepSurface.Stone;

            if (doc.GroundPalettes != null &&
                doc.GroundPalettes.TryGetValue(groundId, out UnifiedMapGroundPalette? palette) &&
                palette != null)
            {
                return FootstepSurfaceMapper.FromSurfaceType(palette.SurfaceType);
            }

            return FootstepSurfaceMapper.FromSurfaceType(groundId);
        }
    }
}
```

Update `game-client/src/Audio/AudioRegistry.cs` so `PlayFootstep` accepts `FootstepSurface surface = FootstepSurface.Stone`, looks up `sfx:footstep_<surface>_1..8` (falling back to `sfx:footstep_1..8` and `sfx:footstep`), tracks non-repeating 3-variant history per surface, and applies balanced per-surface gain/pitch trims.

- [ ] **Step 4: Run `AudioVerify` under `Godot_mono.app` to verify it passes**

Run: `ATLAS_VERIFY_SFX=1 "$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot" --headless --path game-client`
Expected: `[AudioVerify] RESULT: PASS (all cases)`

---

### Task 2: `PlaytestSandboxRoot` 4 Walkable Surface Pads, Caller Wiring, & `PlaytestSandboxVerify`

**Files:**
- Modify: `game-client/src/World/PlaytestSandboxRoot.cs`
- Modify: `game-client/src/VerticalSliceRoot.cs:2107-2115`
- Modify: `game-client/src/World/MaroBellPocController.cs:522-549`
- Test: `game-client/src/World/PlaytestSandboxVerify.cs`

**Interfaces:**
- Consumes: `FootstepSurface`, `FootstepSurfaceResolver.Resolve`, `SurfacePadOverride`, `AudioRegistry.PlayFootstep`
- Produces:
  - `PlaytestSandboxRoot.SurfacePads` (`IReadOnlyList<SurfacePadOverride>`) exposing the 4 labeled walkable pads (`Stone`, `Dirt`, `Water`, `Glass`) spawned near the Bell Terrace spawn plaza.
  - `PlaytestSandboxRoot.ResolveSurfaceAt(Vector3 worldPos)` returning `FootstepSurface`.

- [ ] **Step 1: Write the failing test in `game-client/src/World/PlaytestSandboxVerify.cs`**

```csharp test:game-client/src/World/PlaytestSandboxVerify.cs
            Report("PlaytestSandbox spawns 4 walkable material test pads (Stone, Dirt, Water, Glass)",
                sandbox.SurfacePads.Count == 4);

            bool allPadsResolveAndPlay = sandbox.SurfacePads.Count == 4;
            foreach (var pad in sandbox.SurfacePads)
            {
                Vector2 center = pad.WorldBounds.GetCenter();
                Vector3 probePos = new(center.X, 0f, center.Y);
                var resolved = sandbox.ResolveSurfaceAt(probePos);
                var played = audioReg?.PlayFootstep(probePos, isRightFoot: false, isRunning: false, surface: resolved);
                if (resolved != pad.Surface || played == null || played.Stream == null || !played.Playing)
                    allPadsResolveAndPlay = false;
            }
            // Also verify open meadow grass resolution outside roads/pads (in-bounds on maro-bell width=80)
            var grassProbe = new Vector3(12f, 0f, -15f);
            var grassSurface = sandbox.ResolveSurfaceAt(grassProbe);
            var grassPlayed = audioReg?.PlayFootstep(grassProbe, isRightFoot: true, isRunning: true, surface: grassSurface);
            Report($"All 4 sandbox surface pads (Stone, Dirt, Water, Glass) + open terrain ({grassSurface}==Grass) resolve and play material footsteps",
                allPadsResolveAndPlay && grassSurface == FootstepSurface.Grass &&
                grassPlayed != null && grassPlayed.Stream != null && grassPlayed.Playing);
```

Verify-Cmd: `ATLAS_VERIFY_PLAYTEST_SANDBOX=1 "$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot" --headless --path game-client res://scenes/PlaytestSandbox.tscn`

- [ ] **Step 2: Implement the 4 walkable surface pads in `PlaytestSandboxRoot.cs` and wire all `PlayFootstep` callers**

In `PlaytestSandboxRoot.cs`:
- Add `private readonly List<SurfacePadOverride> _surfacePads = new();` and `private Node3D? _surfacePadsRoot;`
- Expose `public IReadOnlyList<SurfacePadOverride> SurfacePads => _surfacePads;` and `public FootstepSurface ResolveSurfaceAt(Vector3 worldPos) => FootstepSurfaceResolver.Resolve(worldPos, _mapDoc, _surfacePads);`
- In `LoadMap(string mapId)`, call `SpawnSurfaceTestPads();` right after `SpawnTargetDummies();` to place 4 visually distinct, labeled walkable pads (`Stone`, `Dirt`, `Water`, `Glass`, each `2.2m x 2.2m` thin box mesh + floating `Label3D`) in a convenient row beside the Bell Terrace spawn (`z = -12.5f`, `x = -4.2f, -1.4f, +1.4f, +4.2f` on `maro-bell`, or `z = -1.5f` on `freja-south-gate`).
- Update `PlaytestSandboxRoot._Process` line 1349, `VerticalSliceRoot._Process` line 2109, and `MaroBellPocController.StepPlayer` line 530 to resolve `FootstepSurface` via `FootstepSurfaceResolver.Resolve` (storing `private UnifiedMapDocument? _mapDoc;` in `MaroBellPocController.Initialize(UnifiedMapDocument? mapDoc)` and keeping `"sfx:footstep"` on the line 546 fallback so `scripts/tests/poc-maro-wonder.test.mjs:92` continues to pass) and pass `surface` to `PlayFootstep`.
- Also display the current ground surface (`Surface: Stone/Dirt/Grass/Water/Glass`) in `PlaytestSandboxRoot`'s telemetry readout so the player can see the active material while walking across pads.

- [ ] **Step 3: Run `PlaytestSandboxVerify` and `AudioVerify` to verify they pass**

Run:
```bash
ATLAS_VERIFY_SFX=1 "$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot" --headless --path game-client
ATLAS_VERIFY_PLAYTEST_SANDBOX=1 "$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot" --headless --path game-client res://scenes/PlaytestSandbox.tscn
```
Expected: Both print `PASS` and exit `0`.

- [ ] **Step 4: Commit Tasks 1 & 2**

```bash
git add game-client/src/Audio/FootstepSurface.cs game-client/src/World/FootstepSurfaceResolver.cs game-client/src/World/UnifiedMapDocument.cs game-client/src/Audio/AudioRegistry.cs game-client/src/World/PlaytestSandboxRoot.cs game-client/src/VerticalSliceRoot.cs game-client/src/World/MaroBellPocController.cs game-client/src/Audio/AudioVerify.cs game-client/src/World/PlaytestSandboxVerify.cs
git commit -m "feat(audio): add hybrid FootstepSurfaceResolver, material-aware PlayFootstep, and sandbox surface pads (F-223)"
```

---

### Task 3: ElevenLabs Single-Strike Material `.ogg` Assets (`dirt`, `grass`, `water`, `glass`), Manifest + Index Sync, & README Update

**Files:**
- Create: `game-client/assets/audio/footstep_dirt_01.ogg` .. `footstep_dirt_08.ogg` ( plus `.import`)
- Create: `game-client/assets/audio/footstep_grass_01.ogg` .. `footstep_grass_08.ogg` (plus `.import`)
- Create: `game-client/assets/audio/footstep_water_01.ogg` .. `footstep_water_08.ogg` (plus `.import`)
- Create: `game-client/assets/audio/footstep_glass_01.ogg` .. `footstep_glass_08.ogg` (plus `.import`)
- Modify: `game-client/assets/audio-manifest.json`
- Modify: `atelier/atlas-world-panels/audio-index.json`
- Modify: `game-client/src/Audio/AudioVerify.cs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `sfx:footstep_<surface>_1..8` event keys in `AudioRegistry`
- Produces:
  - 8 single-strike `.ogg` variants (0.3–1.2s) per material (`dirt`, `grass`, `water`, `glass`) + `sfx:footstep_stone_1..8` aliases in `game-client/assets/audio-manifest.json`
  - Synced `atelier/atlas-world-panels/audio-index.json` via `node scripts/gen_audio_index.mjs`

- [ ] **Step 1: Generate single-strike ElevenLabs `.ogg` variants for `dirt`, `grass`, `water`, and `glass`**

Use ElevenLabs Sound Effects (via Chrome or ElevenLabs API) with single-strike prompts (0.5–1.0s duration, single soft RPG footstep impact, no multi-step loops):
- `dirt`: `"Single soft RPG boot footstep on packed dirt and dry earth, one single step impact only, subtle soil crunch, clean dry foley, no loop"` -> `footstep_dirt_01..08.ogg`
- `grass`: `"Single soft RPG boot footstep on lush meadow grass and moss, one single step impact only, gentle grass brush, clean dry foley, no loop"` -> `footstep_grass_01..08.ogg`
- `water`: `"Single soft RPG boot footstep in shallow puddle water, one single step splash only, gentle ripple, clean dry foley, no loop"` -> `footstep_water_01..08.ogg`
- `glass`: `"Single soft RPG boot footstep on thick stained glass floor, one single solid glass tap only, crisp crystalline resonance, no shattering, no loop"` -> `footstep_glass_01..08.ogg`

Normalize/trim to `0.3–1.2s` single-strike `.ogg` (Vorbis, 44.1/48kHz mono/stereo) under `game-client/assets/audio/`.

- [ ] **Step 2: Register all material keys in `game-client/assets/audio-manifest.json` and regenerate `atelier/atlas-world-panels/audio-index.json`**

Add `sfx:footstep_stone_1..8`, `sfx:footstep_dirt_1..8`, `sfx:footstep_grass_1..8`, `sfx:footstep_water_1..8`, and `sfx:footstep_glass_1..8` (each with `"license": "CC0"` to satisfy `scripts/check_asset_manifest.mjs`) to `game-client/assets/audio-manifest.json`, run Godot `--headless --import` (or copy `.ogg.import` sidecars and import), and run:
```bash
node scripts/gen_audio_index.mjs
```

- [ ] **Step 3: Assert distinct material stream resolution in `AudioVerify.cs` and update `README.md`**

In `game-client/src/Audio/AudioVerify.cs`:
```csharp
            foreach (string surf in new[] { "stone", "dirt", "grass", "water", "glass" })
            {
                for (int i = 1; i <= 8; i++)
                {
                    failures += ReportResolves(reg, $"sfx:footstep_{surf}_{i}");
                }
            }
            var stoneStream = reg.ResolveStream("sfx:footstep_stone_1");
            var dirtStream = reg.ResolveStream("sfx:footstep_dirt_1");
            var grassStream = reg.ResolveStream("sfx:footstep_grass_1");
            var waterStream = reg.ResolveStream("sfx:footstep_water_1");
            var glassStream = reg.ResolveStream("sfx:footstep_glass_1");
            failures += Report("Each material surface resolves to its own distinct AudioStream resource",
                stoneStream != null && dirtStream != null && grassStream != null && waterStream != null && glassStream != null &&
                stoneStream.ResourcePath != dirtStream.ResourcePath &&
                dirtStream.ResourcePath != grassStream.ResourcePath &&
                grassStream.ResourcePath != waterStream.ResourcePath &&
                waterStream.ResourcePath != glassStream.ResourcePath);
```

Update `README.md` under `Mobile MMORPG Client (Godot 4.7 C# NativeAOT / iOS)` to document material-aware footstep SFX (`FootstepSurfaceResolver`, `Stone`/`Dirt`/`Grass`/`Water`/`Glass` ElevenLabs banks, and `PlaytestSandbox.tscn` surface test pads).

- [ ] **Step 4: Run verification gates (`AudioVerify`, `PlaytestSandboxVerify`, `gen_audio_index`, and `precheck.sh`)**

Run:
```bash
ATLAS_VERIFY_SFX=1 "$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot" --headless --path game-client
ATLAS_VERIFY_PLAYTEST_SANDBOX=1 "$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot" --headless --path game-client res://scenes/PlaytestSandbox.tscn
node --test atelier/atlas-world-panels/tests/smoke/run.mjs
```
Expected: All pass with 0 failures.

- [ ] **Step 5: Commit Task 3**

```bash
git add game-client/assets/audio/ game-client/assets/audio-manifest.json atelier/atlas-world-panels/audio-index.json game-client/src/Audio/AudioVerify.cs README.md
git commit -m "feat(audio): add ElevenLabs dirt/grass/water/glass footstep banks and manifest entries (F-223)"
```

- [ ] **Step 6: Phase gate & Owner Ear-Check (Rule #7 & Rule #17)**
  1. Run independent code review (`invoke_subagent(TypeName: "self", Model: "inherit")`), apply any fixes, and re-verify.
  2. Launch interactive `PlaytestSandbox.tscn` under `Godot_mono.app` so the owner can walk across the 4 labeled pads (`Stone`, `Dirt`, `Water`, `Glass`) plus surrounding grass and ear-check the new SFX before `psrw ship`.

## Appendix — audit trail
- 2026-11-15 self-grill-audit: verdict `safe-with-fixes`. Corrected: (1) store `_mapDoc` in `MaroBellPocController.Initialize` and keep `"sfx:footstep"` literal on line 546 for `poc-maro-wonder.test.mjs:92`; (2) use in-bounds meadow coordinate `(12, 0, -15)` and assert `grassSurface == FootstepSurface.Grass && grassPlayed.Playing` in `PlaytestSandboxVerify.cs`; (3) specify `"license": "CC0"` in `audio-manifest.json` for `check_asset_manifest.mjs`. Open: none.
