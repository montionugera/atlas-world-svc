using Godot;

namespace AtlasWorld.Client.Audio
{
    /// <summary>
    /// Headless self-check for the positional combat-SFX PoC. Audio can't be "heard"
    /// headless, so this asserts the OBSERVABLE contract instead: <see cref="AudioRegistry"/>
    /// resolves each mapped event key to a real <see cref="AudioStream"/>, <see cref="AudioRegistry.Play"/>
    /// spawns a positioned, playing <see cref="AudioStreamPlayer3D"/> with that stream, and
    /// an unknown key no-ops without throwing. Follows the project's env-gated probe
    /// pattern: <c>GameRoot</c> runs this when <c>ATLAS_VERIFY_SFX=1</c>, prints per-case
    /// <c>PASS</c>/<c>FAIL</c> lines and a verdict, and returns a process exit code
    /// (0 = all pass, 1 = any fail).
    /// </summary>
    public static class AudioVerify
    {
        public static int Run()
        {
            GD.Print("[AudioVerify] BEGIN");
            int failures = 0;

            AudioRegistry? reg = AudioRegistry.Instance;
            if (reg == null)
            {
                GD.PrintErr("[AudioVerify]   FAIL  AudioRegistry autoload not ready");
                GD.PrintErr("[AudioVerify] RESULT: FAIL (registry unavailable)");
                return 1;
            }

            // Part 1 — every mapped combat and locomotion event resolves to a real, loaded stream.
            failures += ReportResolves(reg, "sfx:attack");
            failures += ReportResolves(reg, "sfx:hit");
            failures += ReportResolves(reg, "sfx:death");
            failures += ReportResolves(reg, "sfx:footstep");
            failures += ReportResolves(reg, "sfx:footstep_1");
            failures += ReportResolves(reg, "sfx:footstep_2");
            failures += ReportResolves(reg, "sfx:footstep_3");
            failures += ReportResolves(reg, "sfx:footstep_4");
            failures += ReportResolves(reg, "sfx:footstep_5");
            failures += ReportResolves(reg, "sfx:footstep_6");
            failures += ReportResolves(reg, "sfx:footstep_7");
            failures += ReportResolves(reg, "sfx:footstep_8");

            // Part 2 — Play() spawns a positioned, playing 3D one-shot carrying that stream.
            failures += ReportPlay(reg, "sfx:attack", new Vector3(3f, 0f, -2f));
            failures += ReportPlay(reg, "sfx:hit", new Vector3(-1.5f, 0f, 4f));
            failures += ReportPlay(reg, "sfx:death", new Vector3(0f, 0f, 0f));
            failures += ReportPlay(reg, "sfx:footstep", new Vector3(1f, 0f, 1f));

            // Part 3 — an unknown key never throws and never spawns a player.
            int before = reg.GetChildCount();
            bool threw = false;
            AudioStreamPlayer3D? unknownResult = null;
            try
            {
                unknownResult = reg.Play("sfx:does_not_exist", Vector3.Zero);
            }
            catch
            {
                threw = true;
            }
            int after = reg.GetChildCount();
            failures += Report("unknown key never throws", !threw);
            failures += Report("unknown key returns null (no player)", unknownResult == null);
            failures += Report("unknown key spawns no child node", after == before);

            // Part 4 — multi-stride footstep phase subdivision (2.600s 3-stride run loop fires 6 SFX = 3 left + 3 right, never 2 SFX).
            int runStrides = World.AnimationController.ComputeStrideCount(2.600, isRunning: true);
            int walkStartStrides = World.AnimationController.ComputeStrideCount(1.900, isRunning: false);
            int singleWalkStrides = World.AnimationController.ComputeStrideCount(1.100, isRunning: false);
            failures += Report($"ComputeStrideCount detects multi-stride clips (2.60s run={runStrides}==3, 1.90s walk_start={walkStartStrides}==2, 1.10s walk={singleWalkStrides}==1)",
                runStrides == 3 && walkStartStrides == 2 && singleWalkStrides == 1);

            int simLeft = 0;
            int simRight = 0;
            double clipLen = 2.600;
            double prevPhase = 0.0;
            for (int i = 1; i <= 130; i++)
            {
                double t = i * 0.020;
                double currPhase = ((t / clipLen) * runStrides) % 1.0;
                if (World.AnimationController.TryCrossFootstepPhase(prevPhase, currPhase, isRunning: true, out bool rightFoot))
                {
                    if (rightFoot) simRight++;
                    else simLeft++;
                }
                prevPhase = currPhase;
            }
            failures += Report($"2.600s 3-stride run loop fires 6 footstep strikes (left={simLeft}==3, right={simRight}==3, 1 SFX per visual step)",
                simLeft == 3 && simRight == 3);

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

            if (failures == 0)
                GD.Print("[AudioVerify] RESULT: PASS (all cases)");
            else
                GD.PrintErr($"[AudioVerify] RESULT: FAIL ({failures} case(s))");

            return failures == 0 ? 0 : 1;
        }

        private static int ReportResolves(AudioRegistry reg, string eventKey)
        {
            AudioStream? stream = reg.ResolveStream(eventKey);
            return Report($"'{eventKey}' resolves to a non-null AudioStream", stream != null);
        }

        private static int ReportPlay(AudioRegistry reg, string eventKey, Vector3 pos)
        {
            AudioStreamPlayer3D? player = reg.Play(eventKey, pos);
            bool ok = player != null &&
                      GodotObject.IsInstanceValid(player) &&
                      player.Stream != null &&
                      player.GlobalPosition.IsEqualApprox(pos) &&
                      player.Playing;
            string detail = player == null
                ? "<null>"
                : $"stream={(player.Stream != null)} pos={player.GlobalPosition} playing={player.Playing}";
            return Report($"Play('{eventKey}', {pos}) → positioned, playing 3D one-shot ({detail})", ok);
        }

        private static int Report(string name, bool ok)
        {
            GD.Print($"[AudioVerify]   {(ok ? "PASS" : "FAIL")}  {name}");
            return ok ? 0 : 1;
        }
    }
}
