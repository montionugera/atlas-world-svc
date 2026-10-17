using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Godot;

namespace AtlasWorld.Client.World
{
    public sealed class UnifiedMapConcept
    {
        [JsonPropertyName("biome")] public string Biome { get; set; } = "freja_meadow_lush";
        [JsonPropertyName("recommendedLevelRange")] public int[] RecommendedLevelRange { get; set; } = { 1, 15 };
        [JsonPropertyName("skyPreset")] public string SkyPreset { get; set; } = "golden_alpine_meadow";
        [JsonPropertyName("loreSummary")] public string LoreSummary { get; set; } =
            "Sunlit sanctuary meadow south of Prontera bordered by pine timberlands, an ancient 2-story stone watchtower, and a crystal cavern.";
    }

    public sealed class UnifiedMapScatterRule
    {
        [JsonPropertyName("weight")] public float Weight { get; set; } = 0.25f;
        [JsonPropertyName("minSpacingMeters")] public float MinSpacingMeters { get; set; } = 1.5f;
        [JsonPropertyName("assets")] public List<string> Assets { get; set; } = new();
        [JsonPropertyName("disabledAssets")] public List<string> DisabledAssets { get; set; } = new();
        [JsonPropertyName("placement")] public string Placement { get; set; } = "fill";
        [JsonPropertyName("scaleRange")] public float[] ScaleRange { get; set; } = { 0.70f, 1.05f };
        [JsonPropertyName("blocksMovement")] public bool BlocksMovement { get; set; } = false;
        [JsonPropertyName("colliderHalfExtent")] public float ColliderHalfExtent { get; set; } = 0.65f;

        /// <summary>
        /// Returns all assets in <see cref="Assets"/> that are not unchecked in <see cref="DisabledAssets"/>.
        /// Used by the Smart Tag Pool + Checkbox override workflow in the Unified Asset &amp; Map Studio.
        /// </summary>
        public List<string> GetEnabledAssets()
        {
            if (Assets == null || Assets.Count == 0)
                return new List<string>();
            if (DisabledAssets == null || DisabledAssets.Count == 0)
                return Assets;

            var enabled = new List<string>(Assets.Count);
            for (int i = 0; i < Assets.Count; i++)
            {
                string a = Assets[i];
                if (!DisabledAssets.Contains(a))
                    enabled.Add(a);
            }
            return enabled;
        }
    }

    public sealed class UnifiedMapGroundPalette
    {
        [JsonPropertyName("surfaceType")] public string SurfaceType { get; set; } = "lush_grass";
        [JsonPropertyName("albedoTint")] public string AlbedoTint { get; set; } = "#529E47";
        [JsonPropertyName("friction")] public float Friction { get; set; } = 0.80f;
        [JsonPropertyName("maxSlopeDeg")] public float MaxSlopeDeg { get; set; } = 32.0f;
        [JsonPropertyName("clearColliders")] public bool ClearColliders { get; set; } = false;
        [JsonPropertyName("playerScaleBandM")] public float[] PlayerScaleBandM { get; set; } = { 0.90f, 1.20f };
        [JsonPropertyName("scatter")] public Dictionary<string, UnifiedMapScatterRule> Scatter { get; set; } = new();
    }

    public sealed class UnifiedMapRouteSpline
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("groundId")] public string GroundId { get; set; } = "cobble_road";
        [JsonPropertyName("width")] public float Width { get; set; } = 5.0f;
        [JsonPropertyName("clearMargin")] public float ClearMargin { get; set; } = 2.2f;
        [JsonPropertyName("points")] public List<float[]> Points { get; set; } = new();
    }

    public sealed class UnifiedMapGroundZone
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("groundId")] public string GroundId { get; set; } = "meadow_grass";
        [JsonPropertyName("priority")] public int Priority { get; set; } = 10;
        [JsonPropertyName("shape")] public string Shape { get; set; } = "circle"; // "circle" | "annulus" | "rect"
        [JsonPropertyName("x")] public float X { get; set; }
        [JsonPropertyName("z")] public float Z { get; set; }
        [JsonPropertyName("radius")] public float Radius { get; set; } = 24.0f;
        [JsonPropertyName("innerRadius")] public float InnerRadius { get; set; } = 24.0f;
        [JsonPropertyName("outerRadius")] public float OuterRadius { get; set; } = 180.0f;
        [JsonPropertyName("width")] public float Width { get; set; } = 40.0f;
        [JsonPropertyName("height")] public float Height { get; set; } = 40.0f;
        [JsonPropertyName("feather")] public float Feather { get; set; } = 4.0f;
    }

    public sealed class UnifiedMapProp
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("assetPath")] public string AssetPath { get; set; } = "";
        [JsonPropertyName("x")] public float X { get; set; }
        [JsonPropertyName("y")] public float Y { get; set; }
        [JsonPropertyName("z")] public float Z { get; set; }
        [JsonPropertyName("rotY")] public float RotY { get; set; }
        [JsonPropertyName("scale")] public float Scale { get; set; } = 1.0f;
        [JsonPropertyName("blocksMovement")] public bool BlocksMovement { get; set; } = true;
        [JsonPropertyName("colliderHalfExtent")] public float ColliderHalfExtent { get; set; } = 1.0f;
    }

    public sealed class UnifiedMapHeightTerrace
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("x")] public float X { get; set; }
        [JsonPropertyName("z")] public float Z { get; set; }
        [JsonPropertyName("radius")] public float Radius { get; set; } = 12.0f;
        [JsonPropertyName("height")] public float Height { get; set; } = 2.2f;
        [JsonPropertyName("falloff")] public float Falloff { get; set; } = 0.45f;
    }

    /// <summary>
    /// Safe, height-aware 3D Multi-Floor Structure Volume supporting:
    /// - <c>"watchtower"</c>: 2-Story Stone Watchtower with ground floor interior, wide East approach stair ramp,
    ///   elevated 2nd-floor battlement deck (+3.2m), and automatic roof/upper-deck cutaway when the player is on the ground floor.
    /// - <c>"crystal_cave"</c>: Walk-in Underground Crystal Cavern carved beneath a hill with a southern entrance portal
    ///   (bypasses outer cliff slope blocker inside the tunnel), recessed glowing crystal floor, and automatic cave ceiling cutaway.
    /// </summary>
    public sealed class UnifiedMapStructureVolume
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("kind")] public string Kind { get; set; } = "watchtower";
        [JsonPropertyName("x")] public float X { get; set; }
        [JsonPropertyName("z")] public float Z { get; set; }
        [JsonPropertyName("rotY")] public float RotY { get; set; }
        [JsonPropertyName("radius")] public float Radius { get; set; } = 4.6f;
        [JsonPropertyName("upperFloorHeight")] public float UpperFloorHeight { get; set; } = 3.2f;
        [JsonPropertyName("ceilingHeight")] public float CeilingHeight { get; set; } = 3.4f;
    }

    public sealed class UnifiedMapSpawnArea
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("x")] public float X { get; set; }
        [JsonPropertyName("y")] public float Y { get; set; }
        [JsonPropertyName("width")] public float Width { get; set; } = 100f;
        [JsonPropertyName("height")] public float Height { get; set; } = 100f;
        [JsonPropertyName("mobType")] public string MobType { get; set; } = "mob-bramble-stalker";
        [JsonPropertyName("count")] public int Count { get; set; } = 2;
    }

    public sealed class UnifiedMapStaticObstacle
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        [JsonPropertyName("min_x")] public float MinX { get; set; }
        [JsonPropertyName("min_y")] public float MinY { get; set; }
        [JsonPropertyName("max_x")] public float MaxX { get; set; }
        [JsonPropertyName("max_y")] public float MaxY { get; set; }
    }

    public sealed class UnifiedMapDocument
    {
        [JsonPropertyName("version")] public int Version { get; set; } = 3;
        [JsonPropertyName("mapId")] public string MapId { get; set; } = "freja-south-gate";
        [JsonPropertyName("name")] public string Name { get; set; } = "Prontera South Gate \u2014 Freja Meadow";
        [JsonPropertyName("seed")] public int Seed { get; set; } = 104729;
        [JsonPropertyName("width")] public float Width { get; set; } = 4000.0f;
        [JsonPropertyName("height")] public float Height { get; set; } = 4000.0f;
        [JsonPropertyName("baseGroundId")] public string BaseGroundId { get; set; } = "meadow_grass";
        [JsonPropertyName("chunkSizeWorld")] public float ChunkSizeWorld { get; set; } = 24.0f;
        [JsonPropertyName("activeChunkRadius")] public int ActiveChunkRadius { get; set; } = 2;
        [JsonPropertyName("terrainAmplitude")] public float TerrainAmplitude { get; set; } = 1.0f;
        [JsonPropertyName("proceduralClutterDensity")] public int ProceduralClutterDensity { get; set; } = 48;
        [JsonPropertyName("defaultTimeOfDayHours")] public float DefaultTimeOfDayHours { get; set; } = 10.5f;
        [JsonPropertyName("autoAdvanceDayNight")] public bool AutoAdvanceDayNight { get; set; } = true;
        [JsonPropertyName("dayNightSpeedHoursPerSec")] public float DayNightSpeedHoursPerSec { get; set; } = 0.10f;
        [JsonPropertyName("concept")] public UnifiedMapConcept Concept { get; set; } = new();
        [JsonPropertyName("groundPalettes")] public Dictionary<string, UnifiedMapGroundPalette> GroundPalettes { get; set; } = new();
        [JsonPropertyName("routes")] public List<UnifiedMapRouteSpline> Routes { get; set; } = new();
        [JsonPropertyName("groundZones")] public List<UnifiedMapGroundZone> GroundZones { get; set; } = new();
        [JsonPropertyName("heightTerraces")] public List<UnifiedMapHeightTerrace> HeightTerraces { get; set; } = new();
        [JsonPropertyName("structures")] public List<UnifiedMapStructureVolume> Structures { get; set; } = new();
        [JsonPropertyName("props")] public List<UnifiedMapProp> Props { get; set; } = new();
        [JsonPropertyName("spawnAreas")] public List<UnifiedMapSpawnArea> SpawnAreas { get; set; } = new();
        [JsonPropertyName("staticObstacles")] public List<UnifiedMapStaticObstacle> StaticObstacles { get; set; } = new();

        public readonly record struct SpatialObstacleRecord(
            string Id,
            Rect2 WorldRect,
            float MinHeightY,
            float MaxHeightY,
            UnifiedMapStaticObstacle ServerObs);

        /// <summary>
        /// O(1) 2D Spatial Hash Grid of height-aware world-space AABBs (<c>Rect2(minWorldX, minWorldZ, widthWorld, depthWorld)</c> + <c>[MinHeightY..MaxHeightY]</c>)
        /// partitioned by <c>ObstacleCellSizeWorld</c> (8.0m cells) so collision and gizmo queries never scan all obstacles.
        /// </summary>
        [JsonIgnore]
        private readonly Dictionary<Vector2I, List<SpatialObstacleRecord>> _spatialObstacleGrid = new();

        public const float ObstacleCellSizeWorld = 8.0f;

        [JsonIgnore]
        public int SpatialObstacleCellCount => _spatialObstacleGrid.Count;

        [JsonIgnore]
        public Vector2 ServerCenter => new(Width * 0.5f, Height * 0.5f);

        public float HalfWidthWorld(float serverCoordScale = 0.1f) => Width * 0.5f * serverCoordScale;
        public float HalfHeightWorld(float serverCoordScale = 0.1f) => Height * 0.5f * serverCoordScale;

        public static Vector2I WorldToObstacleCell(float wx, float wz) =>
            new(Mathf.FloorToInt(wx / ObstacleCellSizeWorld), Mathf.FloorToInt(wz / ObstacleCellSizeWorld));

        /// <summary>
        /// Computes the minimum Euclidean distance from world point (wx, wz) to any polyline segment in <see cref="Routes"/>.
        /// Returns <c>float.MaxValue</c> if no routes exist.
        /// </summary>
        public float SampleMinRouteDistance(
            float wx,
            float wz,
            out float matchedHalfWidth,
            out float matchedClearMargin,
            out string matchedGroundId)
        {
            matchedHalfWidth = 2.5f;
            matchedClearMargin = 2.0f;
            matchedGroundId = "cobble_road";

            if (Routes == null || Routes.Count == 0)
                return float.MaxValue;

            float bestDist = float.MaxValue;
            Vector2 p = new(wx, wz);

            for (int rIdx = 0; rIdx < Routes.Count; rIdx++)
            {
                var route = Routes[rIdx];
                if (route.Points == null || route.Points.Count < 2)
                    continue;

                float halfW = Mathf.Max(0.8f, route.Width * 0.5f);
                float clearM = Mathf.Max(0.5f, route.ClearMargin);

                for (int i = 0; i < route.Points.Count - 1; i++)
                {
                    var p0Arr = route.Points[i];
                    var p1Arr = route.Points[i + 1];
                    if (p0Arr == null || p1Arr == null || p0Arr.Length < 2 || p1Arr.Length < 2)
                        continue;

                    Vector2 a = new(p0Arr[0], p0Arr[1]);
                    Vector2 b = new(p1Arr[0], p1Arr[1]);
                    float d = DistanceToSegment2D(p, a, b);
                    if (d < bestDist)
                    {
                        bestDist = d;
                        matchedHalfWidth = halfW;
                        matchedClearMargin = clearM;
                        matchedGroundId = string.IsNullOrWhiteSpace(route.GroundId) ? "cobble_road" : route.GroundId;
                    }
                }
            }

            return bestDist;
        }

        private static float DistanceToSegment2D(Vector2 p, Vector2 a, Vector2 b)
        {
            Vector2 ab = b - a;
            float lenSq = ab.LengthSquared();
            if (lenSq < 0.0001f)
                return p.DistanceTo(a);

            float t = Mathf.Clamp((p - a).Dot(ab) / lenSq, 0f, 1f);
            Vector2 proj = a + ab * t;
            return p.DistanceTo(proj);
        }

        /// <summary>
        /// Deterministic 5-stage priority stack resolving the active <c>ground_id</c> at world coordinate (wx, wz)
        /// without storing per-prop coordinates:
        /// 1. Structure Footprint Mask (<c>"structure_foundation"</c>)
        /// 2. Route Spline Corridor (<c>route.GroundId</c>, plus <paramref name="inRouteClearance"/> flag)
        /// 3. Steep Slope Override (<c>"barren_cliff"</c> when slope exceeds palette maxSlopeDeg)
        /// 4. Priority-ordered <see cref="GroundZones"/> with organic hash feathering
        /// 5. Fallback <see cref="BaseGroundId"/> (<c>"meadow_grass"</c>)
        /// </summary>
        public string ResolveGroundIdAt(
            float wx,
            float wz,
            out bool inRouteClearance,
            out float minRouteEdgeDist)
        {
            inRouteClearance = false;
            minRouteEdgeDist = float.MaxValue;

            // 1. Structure Footprint Mask (keeps Watchtower & Crystal Cave interiors/ramps clean)
            for (int i = 0; i < Structures.Count; i++)
            {
                var s = Structures[i];
                if (Mathf.Abs(wx - s.X) <= s.Radius + 3.6f && Mathf.Abs(wz - s.Z) <= s.Radius + 2.2f)
                {
                    return "structure_foundation";
                }
            }

            // 2. Route Spline Corridor
            float routeDist = SampleMinRouteDistance(
                wx,
                wz,
                out float routeHalfW,
                out float routeClearMargin,
                out string routeGroundId);
            minRouteEdgeDist = Mathf.Abs(routeDist - routeHalfW);

            if (routeDist <= routeHalfW)
            {
                inRouteClearance = true;
                return routeGroundId;
            }

            if (routeDist <= routeHalfW + routeClearMargin)
            {
                inRouteClearance = true;
            }

            // Also keep immediate spawn plaza around (0, 0) clear of blocking trees
            if (wx * wx + wz * wz <= 8.5f * 8.5f)
            {
                inRouteClearance = true;
            }

            // 3. Evaluate authored GroundZones ordered by descending priority with deterministic feather jitter
            string resolvedGroundId = string.IsNullOrWhiteSpace(BaseGroundId) ? "meadow_grass" : BaseGroundId;
            int bestPriority = int.MinValue;
            float jitterUnit = SampleDeterministicFeatherNoise(wx, wz) - 0.5f; // [-0.5 .. +0.5]

            for (int i = 0; i < GroundZones.Count; i++)
            {
                var z = GroundZones[i];
                if (z.Priority < bestPriority)
                    continue;

                float featherOffset = jitterUnit * Mathf.Max(0f, z.Feather);
                bool inside = false;
                string shape = (z.Shape ?? "circle").ToLowerInvariant();

                if (shape == "circle")
                {
                    float dist = Mathf.Sqrt((wx - z.X) * (wx - z.X) + (wz - z.Z) * (wz - z.Z));
                    inside = dist <= (z.Radius + featherOffset);
                }
                else if (shape == "annulus")
                {
                    float dist = Mathf.Sqrt((wx - z.X) * (wx - z.X) + (wz - z.Z) * (wz - z.Z));
                    inside = dist >= (z.InnerRadius + featherOffset) && dist <= (z.OuterRadius + featherOffset);
                }
                else if (shape == "rect")
                {
                    float halfW = z.Width * 0.5f + featherOffset;
                    float halfH = z.Height * 0.5f + featherOffset;
                    inside = Mathf.Abs(wx - z.X) <= halfW && Mathf.Abs(wz - z.Z) <= halfH;
                }

                if (inside)
                {
                    bestPriority = z.Priority;
                    resolvedGroundId = z.GroundId;
                }
            }

            // 4. Steep Slope Override (> maxSlopeDeg -> barren_cliff)
            float maxSlope = 32.0f;
            if (GroundPalettes.TryGetValue(resolvedGroundId, out var pal))
            {
                maxSlope = pal.MaxSlopeDeg;
            }

            if (TerrainElevation.SampleSlopeDegrees(wx, wz, this) > maxSlope)
            {
                return "barren_cliff";
            }

            return resolvedGroundId;
        }

        private static float SampleDeterministicFeatherNoise(float wx, float wz)
        {
            int qx = Mathf.FloorToInt(wx * 0.5f);
            int qz = Mathf.FloorToInt(wz * 0.5f);
            uint h = 2166136261u;
            h = (h ^ (uint)qx) * 16777619u;
            h = (h ^ (uint)qz) * 16777619u;
            h ^= h >> 13;
            h *= 0x5bd1e995u;
            h ^= h >> 15;
            return (h & 0xFFFFu) / 65535.0f;
        }

        /// <summary>
        /// O(1) Height-Aware Spatial Hash Grid collision resolver for player/mob movement against solid map props and tower/cave walls.
        /// Only inspects the 3x3 spatial cells around <paramref name="nextX"/>, <paramref name="nextZ"/> and only collides
        /// with obstacles whose vertical slab <c>[MinHeightY .. MaxHeightY]</c> overlaps the entity's current floor height <paramref name="entityY"/>.
        /// </summary>
        public Vector2 ResolveObstacleCollision(
            float curX,
            float curZ,
            float nextX,
            float nextZ,
            float agentRadius = 0.42f,
            float entityY = float.NaN)
        {
            if (_spatialObstacleGrid.Count == 0)
                return new Vector2(nextX, nextZ);

            Vector2I cell = WorldToObstacleCell(nextX, nextZ);
            float rx = nextX;
            float rz = nextZ;

            for (int dz = -1; dz <= 1; dz++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    var key = new Vector2I(cell.X + dx, cell.Y + dz);
                    if (!_spatialObstacleGrid.TryGetValue(key, out var list))
                        continue;

                    for (int i = 0; i < list.Count; i++)
                    {
                        var rec = list[i];
                        // Vertical slab check: ignore obstacles that are on a different floor than the entity!
                        if (!float.IsNaN(entityY) && (entityY + 1.5f < rec.MinHeightY || entityY > rec.MaxHeightY))
                            continue;

                        Rect2 box = rec.WorldRect.Grow(agentRadius);
                        if (box.HasPoint(new Vector2(rx, rz)))
                        {
                            // Push out along the shallowest penetration axis so the player slides cleanly past trunks/pillars/walls
                            float leftPen = Mathf.Abs(rx - box.Position.X);
                            float rightPen = Mathf.Abs((box.Position.X + box.Size.X) - rx);
                            float topPen = Mathf.Abs(rz - box.Position.Y);
                            float bottomPen = Mathf.Abs((box.Position.Y + box.Size.Y) - rz);

                            float minPen = Mathf.Min(Mathf.Min(leftPen, rightPen), Mathf.Min(topPen, bottomPen));
                            if (Mathf.IsEqualApprox(minPen, leftPen))
                                rx = box.Position.X - 0.001f;
                            else if (Mathf.IsEqualApprox(minPen, rightPen))
                                rx = box.Position.X + box.Size.X + 0.001f;
                            else if (Mathf.IsEqualApprox(minPen, topPen))
                                rz = box.Position.Y - 0.001f;
                            else
                                rz = box.Position.Y + box.Size.Y + 0.001f;
                        }
                    }
                }
            }

            return new Vector2(rx, rz);
        }

        /// <summary>
        /// Queries only the static obstacles inside the active world-space radius around <paramref name="focusWorldPos"/>
        /// using the O(1) spatial hash grid, avoiding O(N) full-map scans when rendering AABB gizmos.
        /// </summary>
        public void QueryObstaclesNear(Vector3 focusWorldPos, float maxRadiusMeters, List<UnifiedMapStaticObstacle> results)
        {
            results.Clear();
            if (_spatialObstacleGrid.Count == 0)
                return;

            int cellRadius = Mathf.Clamp(Mathf.CeilToInt(maxRadiusMeters / ObstacleCellSizeWorld), 1, 24);
            Vector2I centerCell = WorldToObstacleCell(focusWorldPos.X, focusWorldPos.Z);
            var seen = new HashSet<string>();

            for (int dz = -cellRadius; dz <= cellRadius; dz++)
            {
                for (int dx = -cellRadius; dx <= cellRadius; dx++)
                {
                    var key = new Vector2I(centerCell.X + dx, centerCell.Y + dz);
                    if (!_spatialObstacleGrid.TryGetValue(key, out var cellList))
                        continue;

                    for (int i = 0; i < cellList.Count; i++)
                    {
                        var item = cellList[i];
                        if (seen.Add(item.Id))
                        {
                            results.Add(item.ServerObs);
                        }
                    }
                }
            }
        }

        /// <summary>
        /// Loads shared ground palette presets from <c>content/ground_palettes.json</c> (or built-in defaults)
        /// and ensures default routes and groundZones exist for v2->v3 migration.
        /// </summary>
        public void EnsureDefaultGroundPalettes()
        {
            try
            {
                string sharedPath = ResolveSharedPalettesFilePath();
                if (File.Exists(sharedPath))
                {
                    string raw = File.ReadAllText(sharedPath);
                    var shared = JsonSerializer.Deserialize<Dictionary<string, UnifiedMapGroundPalette>>(raw);
                    if (shared != null)
                    {
                        foreach (var kv in shared)
                        {
                            if (!GroundPalettes.TryGetValue(kv.Key, out var existingPal))
                            {
                                GroundPalettes[kv.Key] = kv.Value;
                            }
                            else
                            {
                                // Sync Studio checkbox overrides (DisabledAssets) and Chibi scale caps from shared ground_palettes.json
                                existingPal.PlayerScaleBandM = kv.Value.PlayerScaleBandM;
                                foreach (var (ruleKey, sharedRule) in kv.Value.Scatter)
                                {
                                    if (existingPal.Scatter.TryGetValue(ruleKey, out var localRule))
                                    {
                                        localRule.DisabledAssets = sharedRule.DisabledAssets ?? new List<string>();
                                        if (sharedRule.ScaleRange != null && sharedRule.ScaleRange.Length >= 2)
                                            localRule.ScaleRange = sharedRule.ScaleRange;
                                    }
                                    else
                                    {
                                        existingPal.Scatter[ruleKey] = sharedRule;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                GD.Print($"[UnifiedMapDocument] Shared ground palettes fallback ({ex.Message})");
            }

            if (!GroundPalettes.ContainsKey("meadow_grass"))
            {
                GroundPalettes["meadow_grass"] = new UnifiedMapGroundPalette
                {
                    SurfaceType = "lush_grass",
                    AlbedoTint = "#529E47",
                    Friction = 0.80f,
                    MaxSlopeDeg = 32.0f,
                    Scatter = new Dictionary<string, UnifiedMapScatterRule>
                    {
                        ["grass"] = new()
                        {
                            Weight = 0.30f,
                            Assets = new List<string> { "res://assets/nature/grass_1_a_color1.glb" },
                            ScaleRange = new[] { 0.65f, 0.95f },
                            BlocksMovement = false
                        },
                        ["bush"] = new()
                        {
                            Weight = 0.05f,
                            Assets = new List<string> { "res://assets/nature/bush_2_a_color1.glb", "res://assets/nature/bush_1_a_color1.glb" },
                            ScaleRange = new[] { 0.60f, 0.85f },
                            BlocksMovement = false
                        },
                        ["pebble"] = new()
                        {
                            Weight = 0.02f,
                            Assets = new List<string> { "res://assets/nature/rock_1_a_color1.glb", "res://assets/nature/rock_2_a_color1.glb" },
                            ScaleRange = new[] { 0.38f, 0.72f },
                            BlocksMovement = false
                        }
                    }
                };
            }

            if (!GroundPalettes.ContainsKey("pine_forest_border"))
            {
                GroundPalettes["pine_forest_border"] = new UnifiedMapGroundPalette
                {
                    SurfaceType = "forest_moss",
                    AlbedoTint = "#346E36",
                    Friction = 0.90f,
                    MaxSlopeDeg = 30.0f,
                    Scatter = new Dictionary<string, UnifiedMapScatterRule>
                    {
                        ["grass"] = new()
                        {
                            Weight = 0.35f,
                            Assets = new List<string> { "res://assets/nature/grass_1_a_color1.glb" },
                            ScaleRange = new[] { 0.65f, 0.95f },
                            BlocksMovement = false
                        },
                        ["bush"] = new()
                        {
                            Weight = 0.10f,
                            Assets = new List<string> { "res://assets/nature/bush_1_a_color1.glb", "res://assets/nature/bush_2_a_color1.glb" },
                            ScaleRange = new[] { 0.65f, 0.90f },
                            BlocksMovement = false
                        },
                        ["canopy_tree"] = new()
                        {
                            Weight = 0.04f,
                            MinSpacingMeters = 4.2f,
                            Assets = new List<string>
                            {
                                "res://assets/nature/tree_1_a_color1.glb",
                                "res://assets/nature/tree_2_a_color1.glb",
                                "res://assets/nature/tree_3_a_color1.glb"
                            },
                            ScaleRange = new[] { 1.10f, 1.55f },
                            BlocksMovement = true,
                            ColliderHalfExtent = 0.45f
                        },
                        ["boulder"] = new()
                        {
                            Weight = 0.015f,
                            MinSpacingMeters = 4.8f,
                            Assets = new List<string> { "res://assets/nature/rock_1_a_color1.glb", "res://assets/nature/rock_2_a_color1.glb" },
                            ScaleRange = new[] { 0.95f, 1.35f },
                            BlocksMovement = true,
                            ColliderHalfExtent = 0.90f
                        }
                    }
                };
            }

            if (!GroundPalettes.ContainsKey("cobble_road"))
            {
                GroundPalettes["cobble_road"] = new UnifiedMapGroundPalette
                {
                    SurfaceType = "stone_path",
                    AlbedoTint = "#C2B294",
                    Friction = 0.85f,
                    MaxSlopeDeg = 38.0f,
                    ClearColliders = true,
                    Scatter = new Dictionary<string, UnifiedMapScatterRule>
                    {
                        ["road_cobble_trim"] = new()
                        {
                            Weight = 0.14f,
                            Assets = new List<string> { "res://assets/nature/rock_1_a_color1.glb", "res://assets/nature/rock_2_a_color1.glb" },
                            Placement = "edge_only",
                            ScaleRange = new[] { 0.32f, 0.58f },
                            BlocksMovement = false
                        }
                    }
                };
            }

            if (Routes.Count == 0)
            {
                Routes.Add(new UnifiedMapRouteSpline
                {
                    Id = "prontera_south_highway",
                    GroundId = "cobble_road",
                    Width = 5.2f,
                    ClearMargin = 2.4f,
                    Points = new List<float[]>
                    {
                        new[] { 0.0f, -95.0f },
                        new[] { 0.0f, -20.0f },
                        new[] { 0.0f, 20.0f },
                        new[] { 0.0f, 95.0f }
                    }
                });
                Routes.Add(new UnifiedMapRouteSpline
                {
                    Id = "watchtower_east_spur",
                    GroundId = "cobble_road",
                    Width = 3.6f,
                    ClearMargin = 1.8f,
                    Points = new List<float[]>
                    {
                        new[] { -5.5f, -2.0f },
                        new[] { 0.0f, -2.0f },
                        new[] { 9.5f, -3.0f }
                    }
                });
            }

            if (GroundZones.Count == 0)
            {
                GroundZones.Add(new UnifiedMapGroundZone
                {
                    Id = "central_sanctuary_clearing",
                    GroundId = "meadow_grass",
                    Priority = 20,
                    Shape = "circle",
                    X = 0.0f,
                    Z = 0.0f,
                    Radius = 22.0f,
                    Feather = 4.0f
                });
                GroundZones.Add(new UnifiedMapGroundZone
                {
                    Id = "outer_timber_ring",
                    GroundId = "pine_forest_border",
                    Priority = 10,
                    Shape = "annulus",
                    X = 0.0f,
                    Z = 0.0f,
                    InnerRadius = 22.0f,
                    OuterRadius = 190.0f,
                    Feather = 6.0f
                });
            }
        }

        /// <summary>
        /// Ensures default Freja South Gate terrain plateaus and default 3D Showcase Structures
        /// (1 Multi-Floor Watchtower + 1 Underground Crystal Cave) exist so players can test them immediately.
        /// </summary>
        public void EnsureDefaultTerraces()
        {
            EnsureDefaultGroundPalettes();

            if (HeightTerraces.Count == 0)
            {
                HeightTerraces.Add(new UnifiedMapHeightTerrace
                {
                    Id = "sanctuary_north_acropolis",
                    X = 0.0f,
                    Z = -18.0f,
                    Radius = 15.0f,
                    Height = 2.4f,
                    Falloff = 0.45f
                });
                HeightTerraces.Add(new UnifiedMapHeightTerrace
                {
                    Id = "west_watchtower_hill",
                    X = -17.5f,
                    Z = -8.0f,
                    Radius = 11.5f,
                    Height = 2.1f,
                    Falloff = 0.48f
                });
                HeightTerraces.Add(new UnifiedMapHeightTerrace
                {
                    Id = "east_wind_bluff",
                    X = 17.5f,
                    Z = -7.0f,
                    Radius = 12.0f,
                    Height = 2.3f,
                    Falloff = 0.46f
                });
                HeightTerraces.Add(new UnifiedMapHeightTerrace
                {
                    Id = "south_grove_knoll",
                    X = 14.0f,
                    Z = 14.0f,
                    Radius = 11.0f,
                    Height = 1.75f,
                    Falloff = 0.50f
                });
            }

            if (Structures.Count == 0)
            {
                // Default 2-Story Stone Watchtower with Walkable East Ramp on West Meadow
                Structures.Add(new UnifiedMapStructureVolume
                {
                    Id = "freja_west_watchtower_01",
                    Kind = "watchtower",
                    X = -9.5f,
                    Z = -2.0f,
                    RotY = 0f,
                    Radius = 3.6f,
                    UpperFloorHeight = 3.2f,
                    CeilingHeight = 3.2f
                });

                // Default Walk-In Crystal Cave Tunnel on East Bluff
                Structures.Add(new UnifiedMapStructureVolume
                {
                    Id = "freja_east_crystal_cave_01",
                    Kind = "crystal_cave",
                    X = 10.5f,
                    Z = -3.0f,
                    RotY = 0f,
                    Radius = 4.2f,
                    UpperFloorHeight = 3.5f,
                    CeilingHeight = 3.4f
                });
            }
        }

        /// <summary>
        /// Resizes the map in server units (e.g. 1000x1000 -> 2000x2000 or 4000x4000) while preserving
        /// the relative offset of all server spawn areas from the center of the map so existing content stays aligned.
        /// </summary>
        public void ResizeMap(float newWidth, float newHeight, float serverCoordScale = 0.1f)
        {
            Vector2 oldCenter = ServerCenter;
            Width = Mathf.Clamp(newWidth, 500f, 10000f);
            Height = Mathf.Clamp(newHeight, 500f, 10000f);
            Vector2 newCenter = ServerCenter;
            Vector2 delta = newCenter - oldCenter;

            if (delta.LengthSquared() > 0.01f)
            {
                foreach (var zone in SpawnAreas)
                {
                    zone.X = Mathf.Round((zone.X + delta.X) * 10f) / 10f;
                    zone.Y = Mathf.Round((zone.Y + delta.Y) * 10f) / 10f;
                }
            }

            RebuildStaticObstacles(newCenter, serverCoordScale);
        }

        public static string ResolveMapFilePath(string mapId = "freja-south-gate")
        {
            string projectRoot = ProjectSettings.GlobalizePath("res://").TrimEnd('/', '\\');
            string repoRoot = Path.GetFullPath(Path.Combine(projectRoot, ".."));
            return Path.Combine(repoRoot, "content", "maps", $"{mapId}.json");
        }

        public static string ResolveSharedPalettesFilePath()
        {
            string projectRoot = ProjectSettings.GlobalizePath("res://").TrimEnd('/', '\\');
            string repoRoot = Path.GetFullPath(Path.Combine(projectRoot, ".."));
            return Path.Combine(repoRoot, "content", "ground_palettes.json");
        }

        public static UnifiedMapDocument LoadOrDefault(string mapId = "freja-south-gate")
        {
            try
            {
                string path = ResolveMapFilePath(mapId);
                if (File.Exists(path))
                {
                    string raw = File.ReadAllText(path);
                    var doc = JsonSerializer.Deserialize<UnifiedMapDocument>(raw);
                    if (doc != null)
                    {
                        doc.EnsureDefaultTerraces();
                        doc.RebuildStaticObstacles(doc.ServerCenter, 0.1f);
                        return doc;
                    }
                }
            }
            catch (Exception ex)
            {
                GD.Print($"[UnifiedMapDocument] Load fallback ({ex.Message})");
            }

            var fallback = new UnifiedMapDocument { MapId = mapId };
            fallback.EnsureDefaultTerraces();
            fallback.RebuildStaticObstacles(fallback.ServerCenter, 0.1f);
            return fallback;
        }

        /// <summary>
        /// Rebuilds server-rs 2D AABB staticObstacles AND the O(1) 2D Spatial Hash Grid
        /// from hero blocking props PLUS 3D structure perimeter walls and sheer cliff mesas.
        /// </summary>
        public void RebuildStaticObstacles(Vector2 serverCenter, float serverCoordScale)
        {
            StaticObstacles.Clear();
            _spatialObstacleGrid.Clear();

            foreach (var p in Props)
            {
                IndexPropObstacleIncremental(p, serverCenter, serverCoordScale);
            }

            foreach (var s in Structures)
            {
                IndexStructureWallsIncremental(s, serverCenter, serverCoordScale);
            }

            foreach (var t in HeightTerraces)
            {
                if (TerrainElevation.IsSheerCliffTerrace(t))
                {
                    // Register inscribed square AABB in server-rs StaticObstacles so server mobs/bots cannot path through sheer cliff mesas
                    float halfBox = t.Radius * 0.82f;
                    float sxMin = serverCenter.X + ((t.X - halfBox) / serverCoordScale);
                    float syMin = serverCenter.Y + ((t.Z - halfBox) / serverCoordScale);
                    float sxMax = serverCenter.X + ((t.X + halfBox) / serverCoordScale);
                    float syMax = serverCenter.Y + ((t.Z + halfBox) / serverCoordScale);
                    StaticObstacles.Add(new UnifiedMapStaticObstacle
                    {
                        Id = $"cliff_{t.Id}",
                        MinX = Mathf.Round(sxMin * 10f) / 10f,
                        MinY = Mathf.Round(syMin * 10f) / 10f,
                        MaxX = Mathf.Round(sxMax * 10f) / 10f,
                        MaxY = Mathf.Round(syMax * 10f) / 10f,
                    });
                }
            }
        }

        /// <summary>
        /// Incrementally inserts a single blocking prop into <see cref="StaticObstacles"/> and the O(1) spatial hash grid
        /// without scanning the rest of the map.
        /// </summary>
        public void IndexPropObstacleIncremental(UnifiedMapProp p, Vector2 serverCenter, float serverCoordScale)
        {
            if (!p.BlocksMovement)
                return;

            float halfWorld = Mathf.Max(0.25f, p.ColliderHalfExtent * p.Scale * 0.72f);
            float baseGroundY = TerrainElevation.SampleBaseTerrainHeight(p.X, p.Z, this);
            var worldRect = new Rect2(p.X - halfWorld, p.Z - halfWorld, halfWorld * 2f, halfWorld * 2f);
            AddWorldRectObstacle(p.Id, worldRect, baseGroundY - 1.0f, baseGroundY + 4.5f * p.Scale, serverCenter, serverCoordScale);
        }

        /// <summary>
        /// Registers a procedural chunk collider (e.g. a deterministic <c>canopy_tree</c> or <c>boulder</c>)
        /// into the O(1) spatial hash grid without bloating serialized <see cref="Props"/>.
        /// </summary>
        public void IndexProceduralObstacleInSpatialGrid(string id, float wx, float wz, float halfWorld, float baseGroundY)
        {
            var worldRect = new Rect2(wx - halfWorld, wz - halfWorld, halfWorld * 2f, halfWorld * 2f);
            Vector2 serverCenter = ServerCenter;
            const float serverCoordScale = 0.1f;
            float sxMin = serverCenter.X + (worldRect.Position.X / serverCoordScale);
            float syMin = serverCenter.Y + (worldRect.Position.Y / serverCoordScale);
            float sxMax = serverCenter.X + ((worldRect.Position.X + worldRect.Size.X) / serverCoordScale);
            float syMax = serverCenter.Y + ((worldRect.Position.Y + worldRect.Size.Y) / serverCoordScale);

            var obs = new UnifiedMapStaticObstacle
            {
                Id = id,
                MinX = Mathf.Round(sxMin * 10f) / 10f,
                MinY = Mathf.Round(syMin * 10f) / 10f,
                MaxX = Mathf.Round(sxMax * 10f) / 10f,
                MaxY = Mathf.Round(syMax * 10f) / 10f,
            };

            var record = new SpatialObstacleRecord(id, worldRect, baseGroundY - 1.0f, baseGroundY + 5.0f, obs);
            Vector2I minCell = WorldToObstacleCell(worldRect.Position.X, worldRect.Position.Y);
            Vector2I maxCell = WorldToObstacleCell(worldRect.Position.X + worldRect.Size.X, worldRect.Position.Y + worldRect.Size.Y);

            for (int cz = minCell.Y; cz <= maxCell.Y; cz++)
            {
                for (int cx = minCell.X; cx <= maxCell.X; cx++)
                {
                    var cellKey = new Vector2I(cx, cz);
                    if (!_spatialObstacleGrid.TryGetValue(cellKey, out var list))
                    {
                        list = new List<SpatialObstacleRecord>();
                        _spatialObstacleGrid[cellKey] = list;
                    }
                    // Replace if same deterministic id already registered in this cell
                    for (int i = list.Count - 1; i >= 0; i--)
                    {
                        if (list[i].Id == id)
                            list.RemoveAt(i);
                    }
                    list.Add(record);
                }
            }
        }

        /// <summary>
        /// Registers the solid perimeter walls of a 3D Watchtower or Crystal Cave (leaving the southern doorway/ramp open)
        /// into the O(1) height-aware spatial hash grid so entities cannot walk through cave walls or get blocked on the 2F deck.
        /// </summary>
        public void IndexStructureWallsIncremental(UnifiedMapStructureVolume s, Vector2 serverCenter, float serverCoordScale)
        {
            float baseY = TerrainElevation.SampleBaseTerrainHeight(s.X, s.Z, this);
            float r = Mathf.Max(2.5f, s.Radius);
            float wallThick = 0.55f;

            if (s.Kind == "crystal_cave")
            {
                // Cave walls on West, East, and North (leaving South z = +r open for the entrance portal!)
                float minY = baseY - 1.5f;
                float maxY = baseY + s.CeilingHeight + 1.5f;
                // West wall
                AddWorldRectObstacle($"{s.Id}_wall_w", new Rect2(s.X - r, s.Z - r, wallThick, r * 2f), minY, maxY, serverCenter, serverCoordScale);
                // East wall
                AddWorldRectObstacle($"{s.Id}_wall_e", new Rect2(s.X + r - wallThick, s.Z - r, wallThick, r * 2f), minY, maxY, serverCenter, serverCoordScale);
                // North back wall
                AddWorldRectObstacle($"{s.Id}_wall_n", new Rect2(s.X - r, s.Z - r, r * 2f, wallThick), minY, maxY, serverCenter, serverCoordScale);
            }
            else
            {
                // Watchtower 4 corner pillars on the 1st floor ONLY (maxY stops 0.35m below the 2nd-floor deck so 2F is 100% open & walkable!)
                float minY = baseY - 0.5f;
                float maxY = baseY + s.UpperFloorHeight - 0.35f;
                float pOff = r - 0.45f;
                float halfPillar = 0.22f;
                AddWorldRectObstacle($"{s.Id}_pillar_nw", new Rect2(s.X - pOff - halfPillar, s.Z - pOff - halfPillar, halfPillar * 2f, halfPillar * 2f), minY, maxY, serverCenter, serverCoordScale);
                AddWorldRectObstacle($"{s.Id}_pillar_ne", new Rect2(s.X + pOff - halfPillar, s.Z - pOff - halfPillar, halfPillar * 2f, halfPillar * 2f), minY, maxY, serverCenter, serverCoordScale);
                AddWorldRectObstacle($"{s.Id}_pillar_sw", new Rect2(s.X - pOff - halfPillar, s.Z + pOff - halfPillar, halfPillar * 2f, halfPillar * 2f), minY, maxY, serverCenter, serverCoordScale);
                AddWorldRectObstacle($"{s.Id}_pillar_se", new Rect2(s.X + pOff - halfPillar, s.Z + pOff - halfPillar, halfPillar * 2f, halfPillar * 2f), minY, maxY, serverCenter, serverCoordScale);
            }
        }

        private void AddWorldRectObstacle(
            string id,
            Rect2 worldRect,
            float minHeightY,
            float maxHeightY,
            Vector2 serverCenter,
            float serverCoordScale)
        {
            float sxMin = serverCenter.X + (worldRect.Position.X / serverCoordScale);
            float syMin = serverCenter.Y + (worldRect.Position.Y / serverCoordScale);
            float sxMax = serverCenter.X + ((worldRect.Position.X + worldRect.Size.X) / serverCoordScale);
            float syMax = serverCenter.Y + ((worldRect.Position.Y + worldRect.Size.Y) / serverCoordScale);

            var obs = new UnifiedMapStaticObstacle
            {
                Id = id,
                MinX = Mathf.Round(sxMin * 10f) / 10f,
                MinY = Mathf.Round(syMin * 10f) / 10f,
                MaxX = Mathf.Round(sxMax * 10f) / 10f,
                MaxY = Mathf.Round(syMax * 10f) / 10f,
            };
            StaticObstacles.Add(obs);

            var record = new SpatialObstacleRecord(id, worldRect, minHeightY, maxHeightY, obs);
            Vector2I minCell = WorldToObstacleCell(worldRect.Position.X, worldRect.Position.Y);
            Vector2I maxCell = WorldToObstacleCell(worldRect.Position.X + worldRect.Size.X, worldRect.Position.Y + worldRect.Size.Y);

            for (int cz = minCell.Y; cz <= maxCell.Y; cz++)
            {
                for (int cx = minCell.X; cx <= maxCell.X; cx++)
                {
                    var cellKey = new Vector2I(cx, cz);
                    if (!_spatialObstacleGrid.TryGetValue(cellKey, out var list))
                    {
                        list = new List<SpatialObstacleRecord>();
                        _spatialObstacleGrid[cellKey] = list;
                    }
                    list.Add(record);
                }
            }
        }

        public bool SaveToDisk(Vector2 serverCenter, float serverCoordScale, out string savedPath)
        {
            savedPath = ResolveMapFilePath(MapId);
            try
            {
                Version = 3;
                RebuildStaticObstacles(serverCenter, serverCoordScale);
                string? dir = Path.GetDirectoryName(savedPath);
                if (!string.IsNullOrEmpty(dir))
                    Directory.CreateDirectory(dir);

                var opts = new JsonSerializerOptions { WriteIndented = true };
                File.WriteAllText(savedPath, JsonSerializer.Serialize(this, opts));
                GD.Print($"[MapBuilder] Saved unified map v3 ({Width:0}x{Height:0}, {Routes.Count} routes, {GroundZones.Count} groundZones, {Props.Count} hero props, {HeightTerraces.Count} terraces, {Structures.Count} 3D structures, {StaticObstacles.Count} server AABBs) -> {savedPath}");
                return true;
            }
            catch (Exception ex)
            {
                GD.PushWarning($"[MapBuilder] Failed to save map: {ex.Message}");
                return false;
            }
        }
    }
}
