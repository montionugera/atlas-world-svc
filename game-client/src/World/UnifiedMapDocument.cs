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
        [JsonPropertyName("name")] public string Name { get; set; } = "Prontera South Gate — Freja Meadow";
        [JsonPropertyName("width")] public float Width { get; set; } = 1000.0f;
        [JsonPropertyName("height")] public float Height { get; set; } = 1000.0f;
        [JsonPropertyName("props")] public List<UnifiedMapProp> Props { get; set; } = new();
        [JsonPropertyName("spawnAreas")] public List<UnifiedMapSpawnArea> SpawnAreas { get; set; } = new();
        [JsonPropertyName("staticObstacles")] public List<UnifiedMapStaticObstacle> StaticObstacles { get; set; } = new();

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
                        return doc;
                }
            }
            catch (Exception ex)
            {
                GD.Print($"[UnifiedMapDocument] Load fallback ({ex.Message})");
            }

            return new UnifiedMapDocument { MapId = mapId };
        }

        /// <summary>
        /// Rebuilds server-rs 2D AABB staticObstacles from all props marked BlocksMovement = true
        /// using the canonical coordinate transform: ServerPos = 500 + (WorldPos / 0.1).
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
                GD.Print($"[MapBuilder] Saved unified map ({Props.Count} props, {StaticObstacles.Count} server AABBs, {SpawnAreas.Count} spawn zones) -> {savedPath}");
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
