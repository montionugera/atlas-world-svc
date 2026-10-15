using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Godot;

namespace AtlasWorld.Client.World
{
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
        [JsonPropertyName("version")] public int Version { get; set; } = 1;
        [JsonPropertyName("mapId")] public string MapId { get; set; } = "freja-south-gate";
        [JsonPropertyName("name")] public string Name { get; set; } = "Prontera South Gate \u2014 Freja Meadow";
        [JsonPropertyName("width")] public float Width { get; set; } = 1000.0f;
        [JsonPropertyName("height")] public float Height { get; set; } = 1000.0f;
        [JsonPropertyName("chunkSizeWorld")] public float ChunkSizeWorld { get; set; } = 24.0f;
        [JsonPropertyName("activeChunkRadius")] public int ActiveChunkRadius { get; set; } = 2;
        [JsonPropertyName("terrainAmplitude")] public float TerrainAmplitude { get; set; } = 1.0f;
        [JsonPropertyName("heightTerraces")] public List<UnifiedMapHeightTerrace> HeightTerraces { get; set; } = new();
        [JsonPropertyName("props")] public List<UnifiedMapProp> Props { get; set; } = new();
        [JsonPropertyName("spawnAreas")] public List<UnifiedMapSpawnArea> SpawnAreas { get; set; } = new();
        [JsonPropertyName("staticObstacles")] public List<UnifiedMapStaticObstacle> StaticObstacles { get; set; } = new();

        [JsonIgnore]
        public Vector2 ServerCenter => new(Width * 0.5f, Height * 0.5f);

        public float HalfWidthWorld(float serverCoordScale = 0.1f) => Width * 0.5f * serverCoordScale;
        public float HalfHeightWorld(float serverCoordScale = 0.1f) => Height * 0.5f * serverCoordScale;

        /// <summary>
        /// Ensures default Freja South Gate terrain plateaus exist if loading a v1 JSON without heightTerraces.
        /// </summary>
        public void EnsureDefaultTerraces()
        {
            if (HeightTerraces.Count > 0)
                return;

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
            return fallback;
        }

        /// <summary>
        /// Rebuilds server-rs 2D AABB staticObstacles from all props marked BlocksMovement = true
        /// using the canonical coordinate transform: ServerPos = ServerCenter + (WorldPos / 0.1).
        /// </summary>
        public void RebuildStaticObstacles(Vector2 serverCenter, float serverCoordScale)
        {
            StaticObstacles.Clear();
            foreach (var p in Props)
            {
                if (!p.BlocksMovement)
                    continue;

                float halfWorld = Mathf.Max(0.25f, p.ColliderHalfExtent * p.Scale * 0.72f);
                float halfServer = halfWorld / serverCoordScale;
                float sx = serverCenter.X + (p.X / serverCoordScale);
                float sy = serverCenter.Y + (p.Z / serverCoordScale);

                StaticObstacles.Add(new UnifiedMapStaticObstacle
                {
                    Id = p.Id,
                    MinX = Mathf.Round((sx - halfServer) * 10f) / 10f,
                    MinY = Mathf.Round((sy - halfServer) * 10f) / 10f,
                    MaxX = Mathf.Round((sx + halfServer) * 10f) / 10f,
                    MaxY = Mathf.Round((sy + halfServer) * 10f) / 10f,
                });
            }
        }

        public bool SaveToDisk(Vector2 serverCenter, float serverCoordScale, out string savedPath)
        {
            savedPath = ResolveMapFilePath(MapId);
            try
            {
                RebuildStaticObstacles(serverCenter, serverCoordScale);
                string? dir = Path.GetDirectoryName(savedPath);
                if (!string.IsNullOrEmpty(dir))
                    Directory.CreateDirectory(dir);

                var opts = new JsonSerializerOptions { WriteIndented = true };
                File.WriteAllText(savedPath, JsonSerializer.Serialize(this, opts));
                GD.Print($"[MapBuilder] Saved unified map ({Width:0}x{Height:0}, {Props.Count} props, {HeightTerraces.Count} terraces, {StaticObstacles.Count} server AABBs) -> {savedPath}");
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
